import { Router, Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { query, withTransaction } from '@/db/pool'
import { authenticate, isOwner, paginate } from '@/middleware'
import { ok, created, noContent, paginated, NotFoundError, ConflictError, ForbiddenError } from '@/utils/errors'
import { cacheBust } from '@/db/redis'
import { env } from '@/config/env'
import { logger } from '@/utils/logger'

export const adminRouter = Router()

// =============================================================================
// Super-admin guard
// All routes in this module require the super-admin role.
// Super-admins are platform operators — not gym owners.
// They are identified by a special claim in their JWT: role = 'super_admin'
// which is set at login time when the user record has no gym association.
// =============================================================================

function requireSuperAdmin(req: Request, _res: Response, next: Function): void {
  if (req.auth?.role !== 'super_admin') {
    throw new ForbiddenError('Super admin access required')
  }
  next()
}

adminRouter.use(authenticate, requireSuperAdmin)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateGymSchema = z.object({
  name:             z.string().min(1),
  slug:             z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  ownerEmail:       z.string().email(),
  ownerFirstName:   z.string().min(1),
  ownerLastName:    z.string().min(1),
  country:          z.string().length(2).default('NG'),
  currency:         z.string().length(3).default('NGN'),
  timezone:         z.string().default('Africa/Lagos'),
  subscriptionPlan: z.enum(['trial', 'starter', 'growth', 'enterprise']).default('trial'),
})

const UpdateGymPlanSchema = z.object({
  plan:   z.enum(['trial', 'starter', 'growth', 'enterprise']),
  reason: z.string().optional(),
})

const SuspendSchema = z.object({
  reason: z.string().min(1),
})

// =============================================================================
// GET /admin/gyms  — all tenants
// =============================================================================

adminRouter.get('/gyms', async (req: Request, res: Response) => {
  const { page, limit, offset } = paginate(req)

  const status = req.query.status as string | undefined
  const plan   = req.query.plan   as string | undefined
  const search = req.query.search as string | undefined

  const conditions: string[] = ['1=1']
  const params: unknown[]    = []
  let p = 1

  if (status) { conditions.push(`g.subscription_status = $${p++}`); params.push(status) }
  if (plan)   { conditions.push(`g.subscription_plan = $${p++}`);   params.push(plan) }
  if (search) {
    conditions.push(`(g.name ILIKE $${p} OR g.slug ILIKE $${p})`)
    params.push(`%${search}%`)
    p++
  }

  const where = conditions.join(' AND ')

  const [rows, countRow] = await Promise.all([
    query(`
      SELECT
        g.id, g.name, g.slug, g.email,
        g.subscription_plan, g.subscription_status,
        g.country, g.currency, g.timezone,
        g.trial_ends_at, g.created_at,
        -- member count
        (SELECT COUNT(*)::int FROM members m WHERE m.gym_id = g.id AND m.deleted_at IS NULL) AS member_count,
        -- staff count
        (SELECT COUNT(*)::int FROM staff s WHERE s.gym_id = g.id AND s.is_active = TRUE) AS staff_count,
        -- owner email
        u.email AS owner_email
      FROM gyms g
      JOIN users u ON u.id = g.owner_user_id
      WHERE ${where}
      ORDER BY g.created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    query<{ count: string }>(
      `SELECT COUNT(*) FROM gyms g WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// POST /admin/gyms  — provision a new gym tenant
// Creates the gym, owner user account, and seeds all defaults
// (provision_new_gym DB trigger handles location + settings + automations)
// =============================================================================

adminRouter.post('/gyms', async (req: Request, res: Response) => {
  const body = CreateGymSchema.parse(req.body)

  const gym = await withTransaction('platform', async (db) => {
    // Check slug uniqueness
    const existing = await query(
      `SELECT id FROM gyms WHERE slug = $1`, [body.slug]
    )
    if (existing.rows[0]) throw new ConflictError(`Slug '${body.slug}' is already taken`)

    // Find or create owner user
    let ownerId: string
    const existingUser = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`, [body.ownerEmail]
    )

    if (existingUser.rows[0]) {
      ownerId = existingUser.rows[0].id
    } else {
      // Temporary password — owner sets their own via invite email
      const tempHash = await bcrypt.hash(`temp_${Date.now()}`, env.BCRYPT_ROUNDS)
      const newUser  = await query<{ id: string }>(
        `INSERT INTO users (email, password_hash, email_verified)
         VALUES ($1, $2, FALSE) RETURNING id`,
        [body.ownerEmail, tempHash]
      )
      ownerId = newUser.rows[0].id
    }

    // Create the gym — provision_new_gym trigger fires automatically
    const gym = await query<{ id: string }>(`
      INSERT INTO gyms
        (name, slug, owner_user_id, country, currency, timezone,
         subscription_plan, subscription_status, trial_ends_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,'active', NOW() + INTERVAL '14 days')
      RETURNING id, name, slug
    `, [
      body.name, body.slug, ownerId,
      body.country, body.currency, body.timezone,
      body.subscriptionPlan,
    ])

    // Create owner staff record
    await query(`
      INSERT INTO staff (gym_id, user_id, role, is_active, accepted_at)
      VALUES ($1,$2,'owner',TRUE,NOW())
    `, [gym.rows[0].id, ownerId])

    // TODO: enqueue welcome/setup email to gym owner

    return gym.rows[0]
  })

  logger.info('Gym provisioned', { gymId: gym.id, slug: body.slug, owner: body.ownerEmail })

  created(res, gym)
})

// =============================================================================
// GET /admin/gyms/:id
// =============================================================================

adminRouter.get('/gyms/:id', async (req: Request, res: Response) => {
  const row = await query(`
    SELECT
      g.*,
      u.email  AS owner_email,
      -- aggregated stats
      (SELECT COUNT(*)::int  FROM members m WHERE m.gym_id = g.id AND m.deleted_at IS NULL)     AS member_count,
      (SELECT COUNT(*)::int  FROM staff s   WHERE s.gym_id = g.id AND s.is_active = TRUE)        AS staff_count,
      (SELECT COALESCE(SUM(amount),0)::numeric(10,2) FROM payments p
       WHERE p.gym_id = g.id AND p.status = 'succeeded'
       AND   DATE_TRUNC('month', p.paid_at) = DATE_TRUNC('month', NOW()))                        AS mrr
    FROM gyms g
    JOIN users u ON u.id = g.owner_user_id
    WHERE g.id = $1
  `, [req.params.id])

  if (!row.rows[0]) throw new NotFoundError('Gym', req.params.id)
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /admin/gyms/:id/plan  — upgrade or downgrade SaaS tier
// =============================================================================

adminRouter.patch('/gyms/:id/plan', async (req: Request, res: Response) => {
  const body  = UpdateGymPlanSchema.parse(req.body)
  const gymId = req.params.id

  const existing = await query(
    `SELECT subscription_plan FROM gyms WHERE id = $1`, [gymId]
  )
  if (!existing.rows[0]) throw new NotFoundError('Gym', gymId)

  await query(
    `UPDATE gyms SET subscription_plan = $1, updated_at = NOW() WHERE id = $2`,
    [body.plan, gymId]
  )

  // Bust gym status cache
  await cacheBust(`gym:${gymId}:`)

  logger.info('Gym plan updated', {
    gymId,
    from:   existing.rows[0].subscription_plan,
    to:     body.plan,
    reason: body.reason,
  })

  ok(res, { message: `Plan updated to ${body.plan}` })
})

// =============================================================================
// POST /admin/gyms/:id/suspend  — lock tenant access
// =============================================================================

adminRouter.post('/gyms/:id/suspend', async (req: Request, res: Response) => {
  const body  = SuspendSchema.parse(req.body)
  const gymId = req.params.id

  await query(
    `UPDATE gyms SET subscription_status = 'suspended', updated_at = NOW() WHERE id = $1`,
    [gymId]
  )

  // Bust cache so the next request sees the suspended status immediately
  await cacheBust(`gym:${gymId}:`)

  logger.warn('Gym suspended', { gymId, reason: body.reason, by: req.auth.sub })

  ok(res, { message: 'Gym suspended' })
})

// =============================================================================
// POST /admin/gyms/:id/unsuspend
// =============================================================================

adminRouter.post('/gyms/:id/unsuspend', async (req: Request, res: Response) => {
  const gymId = req.params.id

  await query(
    `UPDATE gyms SET subscription_status = 'active', updated_at = NOW() WHERE id = $1`,
    [gymId]
  )

  await cacheBust(`gym:${gymId}:`)

  logger.info('Gym unsuspended', { gymId, by: req.auth.sub })

  ok(res, { message: 'Gym unsuspended' })
})

// =============================================================================
// DELETE /admin/gyms/:id  — hard delete (irreversible — dev/test only)
// =============================================================================

adminRouter.delete('/gyms/:id', async (req: Request, res: Response) => {
  if (env.NODE_ENV === 'production') {
    throw new ForbiddenError('Hard delete is not allowed in production')
  }

  await query(`DELETE FROM gyms WHERE id = $1`, [req.params.id])
  await cacheBust(`gym:${req.params.id}:`)

  noContent(res)
})

// =============================================================================
// GET /admin/analytics  — platform-wide KPIs across all tenants
// =============================================================================

adminRouter.get('/analytics', async (req: Request, res: Response) => {
  const [gyms, revenue, members] = await Promise.all([

    query(`
      SELECT
        COUNT(*)::int                                                         AS total_gyms,
        COUNT(*) FILTER (WHERE subscription_status = 'active')::int          AS active_gyms,
        COUNT(*) FILTER (WHERE subscription_status = 'suspended')::int       AS suspended_gyms,
        COUNT(*) FILTER (WHERE subscription_plan = 'trial')::int             AS on_trial,
        COUNT(*) FILTER (WHERE subscription_plan = 'starter')::int           AS starter,
        COUNT(*) FILTER (WHERE subscription_plan = 'growth')::int            AS growth,
        COUNT(*) FILTER (WHERE subscription_plan = 'enterprise')::int        AS enterprise,
        COUNT(*) FILTER (WHERE DATE(created_at) >= CURRENT_DATE - 30)::int   AS new_last_30d
      FROM gyms
    `),

    query(`
      SELECT
        COALESCE(SUM(amount) FILTER (
          WHERE status = 'succeeded'
          AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())
        ), 0)::numeric(10,2)  AS platform_mrr,
        COALESCE(SUM(amount) FILTER (
          WHERE status = 'succeeded'
          AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
        ), 0)::numeric(10,2)  AS platform_mrr_last_month,
        COALESCE(SUM(amount) FILTER (WHERE status = 'succeeded'), 0)::numeric(12,2) AS platform_arr_annualised
      FROM payments
    `),

    query(`
      SELECT
        COUNT(*)::int                                                       AS total_members,
        COUNT(*) FILTER (WHERE status = 'active')::int                     AS active_members,
        COUNT(*) FILTER (WHERE DATE(joined_at) >= CURRENT_DATE - 30)::int  AS new_last_30d
      FROM members WHERE deleted_at IS NULL
    `),
  ])

  ok(res, {
    gyms:    gyms.rows[0],
    revenue: revenue.rows[0],
    members: members.rows[0],
  })
})

// =============================================================================
// GET /admin/gyms/:id/impersonate  — get an access token for a gym (debugging)
// =============================================================================

adminRouter.post('/gyms/:id/impersonate', async (req: Request, res: Response) => {
  if (env.NODE_ENV === 'production') {
    throw new ForbiddenError('Impersonation is not allowed in production')
  }

  const gymId = req.params.id

  const gym = await query(
    `SELECT id FROM gyms WHERE id = $1`, [gymId]
  )
  if (!gym.rows[0]) throw new NotFoundError('Gym', gymId)

  // Get the owner's staff record
  const staff = await query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM staff WHERE gym_id = $1 AND role = 'owner' LIMIT 1`,
    [gymId]
  )
  if (!staff.rows[0]) throw new NotFoundError('Gym owner')

  const { signAccessToken } = await import('@/utils/jwt')
  const token = signAccessToken({
    sub:     staff.rows[0].user_id,
    gymId,
    staffId: staff.rows[0].id,
    role:    'owner',
  })

  logger.warn('Impersonation token issued', {
    gymId, issuedBy: req.auth.sub,
  })

  ok(res, { accessToken: token, expiresIn: 15 * 60 })
})