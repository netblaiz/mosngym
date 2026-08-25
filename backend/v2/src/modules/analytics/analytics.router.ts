import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery } from '@/db/pool'
import { query } from '@/db/pool'
import { authenticate, resolveTenant, can } from '@/middleware'
import { ok, NotFoundError } from '@/utils/errors'
import { key, cacheAside, TTL } from '@/db/redis'
import { analyticsQueue } from '@/jobs/queues'

export const analyticsRouter = Router()

analyticsRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const DateRangeSchema = z.object({
  from:    z.string().date().optional(),
  to:      z.string().date().optional(),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
})

// =============================================================================
// GET /analytics/overview  — main dashboard KPIs
// Served from Redis cache (5 min TTL) — hits DB only on miss
// =============================================================================

analyticsRouter.get('/overview', can('analytics:read'), async (req: Request, res: Response) => {
  const { gymId } = req

  const data = await cacheAside(
    key(gymId, 'analytics:overview'),
    TTL.MEDIUM,
    async () => {
      const [members, revenue, checkins, classes, leads] = await Promise.all([

        // Member counts
        tenantQuery(gymId, `
          SELECT
            COUNT(*) FILTER (WHERE status = 'active')::int                   AS active_members,
            COUNT(*) FILTER (WHERE DATE(joined_at) >= CURRENT_DATE - 30)::int AS new_last_30d,
            COUNT(*) FILTER (WHERE status = 'frozen')::int                   AS frozen,
            COUNT(*) FILTER (WHERE status = 'inactive')::int                 AS inactive
          FROM members WHERE gym_id = $1 AND deleted_at IS NULL
        `, [gymId]),

        // Revenue this month vs last month
        tenantQuery(gymId, `
          SELECT
            COALESCE(SUM(amount) FILTER (
              WHERE status = 'succeeded'
                AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', CURRENT_DATE)
            ), 0)::numeric(10,2)  AS revenue_this_month,
            COALESCE(SUM(amount) FILTER (
              WHERE status = 'succeeded'
                AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
            ), 0)::numeric(10,2)  AS revenue_last_month,
            COUNT(*) FILTER (WHERE status = 'failed' AND DATE(created_at) >= CURRENT_DATE - 7)::int AS failed_last_7d
          FROM payments WHERE gym_id = $1
        `, [gymId]),

        // Check-ins today and this week
        tenantQuery(gymId, `
          SELECT
            COUNT(*) FILTER (WHERE DATE(checked_in_at) = CURRENT_DATE)::int       AS checkins_today,
            COUNT(*) FILTER (WHERE checked_in_at >= CURRENT_DATE - 7)::int        AS checkins_last_7d,
            COUNT(DISTINCT member_id) FILTER (WHERE DATE(checked_in_at) = CURRENT_DATE)::int AS unique_today
          FROM check_ins WHERE gym_id = $1 AND result = 'granted'
        `, [gymId]),

        // Classes today
        tenantQuery(gymId, `
          SELECT
            COUNT(*)::int AS classes_today,
            COALESCE(AVG(
              100.0 * confirmed / NULLIF(capacity, 0)
            ), 0)::numeric(5,2) AS avg_fill_rate_today
          FROM (
            SELECT cs.capacity,
              COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','attended')) AS confirmed
            FROM   class_sessions cs
            LEFT   JOIN bookings b ON b.session_id = cs.id
            WHERE  cs.gym_id = $1 AND DATE(cs.starts_at) = CURRENT_DATE
              AND  cs.status != 'cancelled'
            GROUP  BY cs.id
          ) s
        `, [gymId]),

        // Leads pipeline
        tenantQuery(gymId, `
          SELECT
            COUNT(*) FILTER (WHERE stage NOT IN ('converted','lost'))::int AS open_leads,
            COUNT(*) FILTER (WHERE stage = 'converted'
              AND DATE(updated_at) >= CURRENT_DATE - 30)::int              AS converted_last_30d
          FROM leads WHERE gym_id = $1
        `, [gymId]),
      ])

      return {
        members:  members.rows[0],
        revenue:  revenue.rows[0],
        checkins: checkins.rows[0],
        classes:  classes.rows[0],
        leads:    leads.rows[0],
        generatedAt: new Date().toISOString(),
      }
    }
  )

  ok(res, data)
})

// =============================================================================
// GET /analytics/revenue  — revenue over time
// =============================================================================

analyticsRouter.get('/revenue', can('analytics:read'), async (req: Request, res: Response) => {
  const { gymId }  = req
  const q          = DateRangeSchema.parse(req.query)
  const from       = q.from ?? thirtyDaysAgo()
  const to         = q.to   ?? today()

  const truncMap   = { day: 'day', week: 'week', month: 'month' } as const
  const trunc      = truncMap[q.groupBy]

  const rows = await tenantQuery(gymId, `
    SELECT
      DATE_TRUNC($1, paid_at)::date              AS period,
      COALESCE(SUM(amount), 0)::numeric(10,2)    AS total,
      COALESCE(SUM(amount) FILTER (WHERE type = 'subscription'), 0)::numeric(10,2) AS subscriptions,
      COALESCE(SUM(amount) FILTER (WHERE type = 'pos_sale'),     0)::numeric(10,2) AS pos,
      COALESCE(SUM(amount) FILTER (WHERE type = 'one_off'),      0)::numeric(10,2) AS one_off,
      COUNT(*)::int                              AS transaction_count
    FROM   payments
    WHERE  gym_id = $2
      AND  status  = 'succeeded'
      AND  paid_at >= $3
      AND  paid_at <= $4
    GROUP  BY DATE_TRUNC($1, paid_at)
    ORDER  BY period ASC
  `, [trunc, gymId, from, to])

  ok(res, { data: rows.rows, from, to, groupBy: q.groupBy })
})

// =============================================================================
// GET /analytics/members  — member growth and churn over time
// =============================================================================

analyticsRouter.get('/members', can('analytics:read'), async (req: Request, res: Response) => {
  const { gymId } = req
  const q         = DateRangeSchema.parse(req.query)
  const from      = q.from ?? ninetyDaysAgo()
  const to        = q.to   ?? today()

  const rows = await tenantQuery(gymId, `
    SELECT
      DATE_TRUNC($1, joined_at)::date AS period,
      COUNT(*)::int                  AS new_members,
      COUNT(*) FILTER (WHERE status = 'inactive')::int AS churned
    FROM   members
    WHERE  gym_id = $2
      AND  joined_at >= $3
      AND  joined_at <= $4
      AND  deleted_at IS NULL
    GROUP  BY DATE_TRUNC($1, joined_at)
    ORDER  BY period ASC
  `, [q.groupBy, gymId, from, to])

  // Also return current totals by plan
  const byPlan = await tenantQuery(gymId, `
    SELECT
      mp.name AS plan_name,
      COUNT(ms.id)::int AS member_count
    FROM   member_subscriptions ms
    JOIN   membership_plans mp ON mp.id = ms.plan_id
    WHERE  ms.gym_id = $1 AND ms.status = 'active'
    GROUP  BY mp.name
    ORDER  BY member_count DESC
  `, [gymId])

  ok(res, { data: rows.rows, byPlan: byPlan.rows, from, to, groupBy: q.groupBy })
})

// =============================================================================
// GET /analytics/retention  — cohort retention and at-risk members
// =============================================================================

analyticsRouter.get('/retention', can('analytics:read'), async (req: Request, res: Response) => {
  const { gymId } = req

  const [atRisk, churnRate, avgLifetime] = await Promise.all([

    // At-risk: active members who haven't checked in for 14+ days
    tenantQuery(gymId, `
      SELECT
        m.id, m.first_name, m.last_name, m.email,
        MAX(ci.checked_in_at) AS last_checkin,
        (CURRENT_DATE - MAX(ci.checked_in_at)::date)::int AS days_since_checkin
      FROM   members m
      LEFT   JOIN check_ins ci ON ci.member_id = m.id AND ci.result = 'granted'
      JOIN   member_subscriptions ms ON ms.member_id = m.id AND ms.status = 'active'
      WHERE  m.gym_id = $1 AND m.status = 'active'
      GROUP  BY m.id
      HAVING MAX(ci.checked_in_at) < CURRENT_DATE - 14
          OR MAX(ci.checked_in_at) IS NULL
      ORDER  BY days_since_checkin DESC NULLS FIRST
      LIMIT  50
    `, [gymId]),

    // Churn rate: members cancelled in last 30 days / active at start of period
    tenantQuery(gymId, `
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'cancelled'
            AND cancelled_at >= CURRENT_DATE - 30
        )::numeric /
        NULLIF(COUNT(*) FILTER (
          WHERE created_at <= CURRENT_DATE - 30
        ), 0) * 100 AS churn_rate_pct
      FROM member_subscriptions WHERE gym_id = $1
    `, [gymId]),

    // Average membership lifetime in days
    tenantQuery(gymId, `
      SELECT
        AVG(
          EXTRACT(DAY FROM (COALESCE(cancelled_at, NOW()) - created_at))
        )::int AS avg_lifetime_days
      FROM member_subscriptions WHERE gym_id = $1
    `, [gymId]),
  ])

  ok(res, {
    atRisk:          atRisk.rows,
    churnRatePct:    parseFloat(churnRate.rows[0]?.churn_rate_pct ?? '0'),
    avgLifetimeDays: avgLifetime.rows[0]?.avg_lifetime_days ?? 0,
  })
})

// =============================================================================
// GET /analytics/classes  — class utilisation
// =============================================================================

analyticsRouter.get('/classes', can('analytics:read'), async (req: Request, res: Response) => {
  const { gymId } = req
  const q         = DateRangeSchema.parse(req.query)
  const from      = q.from ?? thirtyDaysAgo()
  const to        = q.to   ?? today()

  const [utilisation, popular, peakHours] = await Promise.all([

    // Overall fill rate over time
    tenantQuery(gymId, `
      SELECT
        DATE_TRUNC($1, cs.starts_at)::date         AS period,
        COUNT(cs.id)::int                          AS total_classes,
        AVG(100.0 * confirmed / NULLIF(cs.capacity, 0))::numeric(5,2) AS avg_fill_rate
      FROM class_sessions cs
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS confirmed
        FROM   bookings b
        WHERE  b.session_id = cs.id AND b.status IN ('confirmed','attended')
      ) occ ON TRUE
      WHERE cs.gym_id = $2
        AND cs.starts_at BETWEEN $3 AND $4
        AND cs.status != 'cancelled'
      GROUP BY DATE_TRUNC($1, cs.starts_at)
      ORDER BY period ASC
    `, [q.groupBy, gymId, from, to]),

    // Most popular classes
    tenantQuery(gymId, `
      SELECT
        ct.name,
        COUNT(cs.id)::int                          AS sessions_held,
        AVG(100.0 * confirmed / NULLIF(cs.capacity,0))::numeric(5,2) AS avg_fill_rate,
        SUM(confirmed)::int                        AS total_attendees
      FROM class_sessions cs
      JOIN class_templates ct ON ct.id = cs.template_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS confirmed FROM bookings b
        WHERE b.session_id = cs.id AND b.status IN ('confirmed','attended')
      ) occ ON TRUE
      WHERE cs.gym_id = $1
        AND cs.starts_at BETWEEN $2 AND $3
        AND cs.status != 'cancelled'
      GROUP BY ct.name
      ORDER BY total_attendees DESC
      LIMIT 10
    `, [gymId, from, to]),

    // Peak hours
    tenantQuery(gymId, `
      SELECT
        EXTRACT(HOUR FROM checked_in_at)::int AS hour,
        COUNT(*)::int                         AS checkin_count
      FROM check_ins
      WHERE gym_id = $1
        AND result = 'granted'
        AND checked_in_at BETWEEN $2 AND $3
      GROUP BY EXTRACT(HOUR FROM checked_in_at)
      ORDER BY hour ASC
    `, [gymId, from, to]),
  ])

  ok(res, {
    utilisation: utilisation.rows,
    popular:     popular.rows,
    peakHours:   peakHours.rows,
    from, to,
  })
})

// =============================================================================
// GET /analytics/checkins  — check-in trends
// =============================================================================

analyticsRouter.get('/checkins', can('analytics:read'), async (req: Request, res: Response) => {
  const { gymId } = req
  const q         = DateRangeSchema.parse(req.query)
  const from      = q.from ?? thirtyDaysAgo()
  const to        = q.to   ?? today()

  const rows = await tenantQuery(gymId, `
    SELECT
      DATE_TRUNC($1, checked_in_at)::date           AS period,
      COUNT(*)::int                                 AS total,
      COUNT(DISTINCT member_id)::int                AS unique_members
    FROM check_ins
    WHERE gym_id = $2
      AND result = 'granted'
      AND checked_in_at BETWEEN $3 AND $4
    GROUP BY DATE_TRUNC($1, checked_in_at)
    ORDER BY period ASC
  `, [q.groupBy, gymId, from, to])

  ok(res, { data: rows.rows, from, to, groupBy: q.groupBy })
})

// =============================================================================
// POST /analytics/export  — queue a CSV export job
// =============================================================================

analyticsRouter.post('/export', can('analytics:export'), async (req: Request, res: Response) => {
  const { gymId }  = req
  const { reportId, emails } = z.object({
    reportId: z.string().uuid().optional(),
    emails:   z.array(z.string().email()).min(1),
  }).parse(req.body)

  // If no reportId, create a default overview report
  let resolvedReportId = reportId
  if (!resolvedReportId) {
    const row = await tenantQuery(gymId,
      `INSERT INTO saved_reports (gym_id, created_by_id, name, type, config)
       VALUES ($1,$2,'Quick export','members','{}') RETURNING id`,
      [gymId, req.staffId]
    )
    resolvedReportId = row.rows[0].id
  }

  await analyticsQueue.add('analytics.export', {
    gymId,
    reportId:    resolvedReportId!,
    requestedBy: req.staffId ?? '',
    emails,
  })

  ok(res, { message: 'Export queued — you will receive an email when ready' })
})

// =============================================================================
// Helpers
// =============================================================================

const today        = ()         => new Date().toISOString().split('T')[0]
const thirtyDaysAgo = ()        => daysAgo(30)
const ninetyDaysAgo = ()        => daysAgo(90)
const daysAgo       = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}