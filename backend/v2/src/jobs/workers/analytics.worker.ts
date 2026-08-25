import { Worker, Job } from 'bullmq'
import { bullConnection } from '@/jobs/connection'
import { AnalyticsJobName, AnalyticsJobData, AnalyticsSnapshotJob, AnalyticsExportJob } from '@/jobs/types'
import { query, tenantQuery } from '@/db/pool'
import { notificationQueue } from '@/jobs/queues'
import { logger } from '@/utils/logger'

// =============================================================================
// Analytics worker
// Handles: daily snapshot computation, CSV export generation
// =============================================================================

export function startAnalyticsWorker() {
  const worker = new Worker<AnalyticsJobData, void, AnalyticsJobName>(
    'analytics',
    async (job) => {
      switch (job.name) {
        case 'analytics.snapshot': return processSnapshot(job as Job<AnalyticsSnapshotJob>)
        case 'analytics.export':   return processExport(job as Job<AnalyticsExportJob>)
      }
    },
    {
      connection:  bullConnection,
      concurrency: 3,  // analytics queries are heavy — keep concurrency low
    }
  )

  worker.on('failed', (job, err) =>
    logger.error('Analytics job failed', { jobId: job?.id, error: err.message })
  )

  logger.info('Analytics worker started')
  return worker
}

// =============================================================================
// analytics.snapshot — compute KPIs for one gym for one day
// Runs nightly via the scheduler (Step 13) for all active gyms
// =============================================================================

async function processSnapshot(job: Job<AnalyticsSnapshotJob>): Promise<void> {
  const { gymId, date } = job.data

  // Run all aggregation queries in parallel — each hits the tenant's data
  const [members, revenue, checkins, bookings, classes, leads] = await Promise.all([

    // Active member counts
    tenantQuery<{
      total_active: string; new_members: string;
      cancelled: string; frozen: string
    }>(gymId, `
      SELECT
        COUNT(*) FILTER (WHERE status = 'active')::text   AS total_active,
        COUNT(*) FILTER (
          WHERE DATE(joined_at) = $2
        )::text                                            AS new_members,
        COUNT(*) FILTER (WHERE status = 'inactive')::text AS cancelled,
        COUNT(*) FILTER (WHERE status = 'frozen')::text   AS frozen
      FROM members WHERE gym_id = $1 AND deleted_at IS NULL
    `, [gymId, date]),

    // Revenue for the day
    tenantQuery<{
      total: string; subscriptions: string; pos: string; one_off: string; failed: string
    }>(gymId, `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0)::text                   AS total,
        COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded' AND type = 'subscription'), 0)::text AS subscriptions,
        COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded' AND type = 'pos_sale'), 0)::text     AS pos,
        COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded' AND type = 'one_off'), 0)::text      AS one_off,
        COUNT(*)             FILTER (WHERE status = 'failed')::text                          AS failed
      FROM payments
      WHERE gym_id = $1 AND DATE(created_at) = $2
    `, [gymId, date]),

    // Check-ins for the day
    tenantQuery<{ total: string; unique: string }>(gymId, `
      SELECT
        COUNT(*)::text                      AS total,
        COUNT(DISTINCT member_id)::text     AS unique
      FROM check_ins
      WHERE gym_id = $1 AND DATE(checked_in_at) = $2 AND result = 'granted'
    `, [gymId, date]),

    // Booking stats
    tenantQuery<{ confirmed: string; cancelled: string; no_show: string }>(gymId, `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('confirmed','attended'))::text AS confirmed,
        COUNT(*) FILTER (WHERE status = 'cancelled')::text               AS cancelled,
        COUNT(*) FILTER (WHERE status = 'no_show')::text                 AS no_show
      FROM bookings
      WHERE gym_id = $1 AND DATE(booked_at) = $2
    `, [gymId, date]),

    // Class fill rate
    tenantQuery<{ classes_held: string; avg_fill: string }>(gymId, `
      SELECT
        COUNT(*)::text                            AS classes_held,
        AVG(
          100.0 * confirmed_count / NULLIF(capacity, 0)
        )::text                                   AS avg_fill
      FROM (
        SELECT
          cs.id, cs.capacity,
          COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','attended')) AS confirmed_count
        FROM   class_sessions cs
        LEFT   JOIN bookings b ON b.session_id = cs.id
        WHERE  cs.gym_id = $1
          AND  DATE(cs.starts_at) = $2
          AND  cs.status != 'cancelled'
        GROUP  BY cs.id
      ) s
    `, [gymId, date]),

    // Lead stats
    tenantQuery<{ new_leads: string; converted: string }>(gymId, `
      SELECT
        COUNT(*) FILTER (WHERE DATE(created_at) = $2)::text                   AS new_leads,
        COUNT(*) FILTER (WHERE stage = 'converted' AND DATE(updated_at) = $2)::text AS converted
      FROM leads WHERE gym_id = $1
    `, [gymId, date]),
  ])

  const m  = members.rows[0]
  const r  = revenue.rows[0]
  const ci = checkins.rows[0]
  const bk = bookings.rows[0]
  const cl = classes.rows[0]
  const ld = leads.rows[0]

  // Upsert snapshot — safe to re-run if the job retries
  await tenantQuery(gymId, `
    INSERT INTO analytics_daily_snapshots
      (gym_id, snapshot_date,
       total_members_active, new_members, cancelled_members, frozen_members,
       revenue_total, revenue_subscriptions, revenue_pos, revenue_one_off, failed_payments,
       checkins_total, unique_visitors,
       bookings_confirmed, bookings_cancelled, bookings_no_show,
       classes_held, avg_class_fill_rate,
       new_leads, leads_converted)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
    ON CONFLICT (gym_id, snapshot_date) DO UPDATE SET
      total_members_active  = EXCLUDED.total_members_active,
      new_members           = EXCLUDED.new_members,
      cancelled_members     = EXCLUDED.cancelled_members,
      frozen_members        = EXCLUDED.frozen_members,
      revenue_total         = EXCLUDED.revenue_total,
      revenue_subscriptions = EXCLUDED.revenue_subscriptions,
      revenue_pos           = EXCLUDED.revenue_pos,
      revenue_one_off       = EXCLUDED.revenue_one_off,
      failed_payments       = EXCLUDED.failed_payments,
      checkins_total        = EXCLUDED.checkins_total,
      unique_visitors       = EXCLUDED.unique_visitors,
      bookings_confirmed    = EXCLUDED.bookings_confirmed,
      bookings_cancelled    = EXCLUDED.bookings_cancelled,
      bookings_no_show      = EXCLUDED.bookings_no_show,
      classes_held          = EXCLUDED.classes_held,
      avg_class_fill_rate   = EXCLUDED.avg_class_fill_rate,
      new_leads             = EXCLUDED.new_leads,
      leads_converted       = EXCLUDED.leads_converted
  `, [
    gymId, date,
    parseInt(m?.total_active    ?? '0'),
    parseInt(m?.new_members     ?? '0'),
    parseInt(m?.cancelled       ?? '0'),
    parseInt(m?.frozen          ?? '0'),
    parseFloat(r?.total         ?? '0'),
    parseFloat(r?.subscriptions ?? '0'),
    parseFloat(r?.pos           ?? '0'),
    parseFloat(r?.one_off       ?? '0'),
    parseInt(r?.failed          ?? '0'),
    parseInt(ci?.total          ?? '0'),
    parseInt(ci?.unique         ?? '0'),
    parseInt(bk?.confirmed      ?? '0'),
    parseInt(bk?.cancelled      ?? '0'),
    parseInt(bk?.no_show        ?? '0'),
    parseInt(cl?.classes_held   ?? '0'),
    parseFloat(cl?.avg_fill     ?? '0'),
    parseInt(ld?.new_leads      ?? '0'),
    parseInt(ld?.converted      ?? '0'),
  ])

  logger.info('Analytics snapshot saved', { gymId, date })
}

// =============================================================================
// analytics.export — generate report and email it
// =============================================================================

async function processExport(job: Job<AnalyticsExportJob>): Promise<void> {
  const { gymId, reportId, requestedBy, emails } = job.data

  // Load the saved report config
  const reportRow = await tenantQuery(gymId,
    `SELECT * FROM saved_reports WHERE id = $1`, [reportId]
  )
  const report = reportRow.rows[0]
  if (!report) return

  // Pull last 30 days of snapshots as the export data
  const rows = await tenantQuery(gymId, `
    SELECT *
    FROM   analytics_daily_snapshots
    WHERE  gym_id = $1
      AND  snapshot_date >= CURRENT_DATE - INTERVAL '30 days'
    ORDER  BY snapshot_date DESC
  `, [gymId])

  // Convert to CSV
  const csv = toCsv(rows.rows)

  // Email to all recipients
  for (const email of emails) {
    await notificationQueue.add('notification.email', {
      gymId,
      to:      email,
      subject: `Report: ${report.name}`,
      body:    `<p>Your report is attached.</p><pre>${csv}</pre>`,
    })
  }

  // Update last_run_at on the saved report
  await tenantQuery(gymId,
    `UPDATE saved_reports SET last_run_at = NOW() WHERE id = $1`, [reportId]
  )

  logger.info('Analytics export completed', { gymId, reportId, recipients: emails.length })
}

// =============================================================================
// Simple CSV serialiser
// =============================================================================

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines   = rows.map(r =>
    headers.map(h => JSON.stringify(r[h] ?? '')).join(',')
  )
  return [headers.join(','), ...lines].join('\n')
}