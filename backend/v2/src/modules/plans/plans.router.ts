import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import { authenticate, resolveTenant, can } from '@/middleware'
import { ok, created, noContent, NotFoundError, ConflictError } from '@/utils/errors'
import { getProviderForGym } from '@/services/payment'
import { logger } from '@/utils/logger'

export const plansRouter = Router()

plansRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const DayHoursSchema = z.object({
  closed: z.boolean().default(false),
  open:   z.string().regex(/^\d{2}:\d{2}$/).default('06:00'),
  close:  z.string().regex(/^\d{2}:\d{2}$/).default('22:00'),
})

const OperatingHoursSchema = z.object({
  mon: DayHoursSchema,
  tue: DayHoursSchema,
  wed: DayHoursSchema,
  thu: DayHoursSchema,
  fri: DayHoursSchema,
  sat: DayHoursSchema,
  sun: DayHoursSchema,
}).optional().nullable()

const DiscountSchema = z.object({
  label:     z.string().min(1),
  type:      z.enum(['percentage', 'fixed']),
  value:     z.number().positive(),
  code:      z.string().optional(),
  expiresAt: z.string().optional(),
})

const CreatePlanSchema = z.object({
  name:                z.string().min(1),
  description:         z.string().optional(),
  price:               z.number().min(0),
  billingCycle:        z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'one_time', 'drop_in']),
  durationDays:        z.number().int().positive().optional(),
  classCredits:        z.number().int().min(0).optional().nullable(),
  accessAllLocations:  z.boolean().default(true),
  accessLocationIds:   z.array(z.string().uuid()).optional(),
  isPublic:            z.boolean().default(true),
  sortOrder:           z.number().int().default(0),
  hasHourRestrictions: z.boolean().default(false),
  operatingHours:      OperatingHoursSchema,
  discounts:           z.array(DiscountSchema).default([]),
})

const UpdatePlanSchema = CreatePlanSchema.partial()

// =============================================================================
// GET /plans
// =============================================================================

plansRouter.get('/', can('subscriptions:read'), async (req: Request, res: Response) => {
  const includeArchived = req.query.archived === 'true'

  const rows = await tenantQuery(req.gymId, `
    SELECT
      p.*,
      COUNT(ms.id) FILTER (WHERE ms.status = 'active')::int AS active_subscriptions
    FROM   membership_plans p
    LEFT   JOIN member_subscriptions ms ON ms.plan_id = p.id
    WHERE  p.gym_id = $1
      ${includeArchived ? '' : 'AND p.archived_at IS NULL'}
    GROUP  BY p.id
    ORDER  BY p.sort_order ASC, p.created_at ASC
  `, [req.gymId])

  ok(res, rows.rows)
})

// =============================================================================
// POST /plans
// =============================================================================

plansRouter.post('/', can('plans:manage'), async (req: Request, res: Response) => {
  const body  = CreatePlanSchema.parse(req.body)
  const gymId = req.gymId

  // Get gym currency
  const gymRow = await tenantQuery(gymId,
    `SELECT currency FROM gyms WHERE id = $1`, [gymId]
  )
  const currency = gymRow.rows[0]?.currency ?? 'NGN'

  let stripePriceId:   string | null = null
  let stripeProductId: string | null = null

  // Create on payment provider for paid recurring plans
  if (body.price > 0 && !['one_time', 'drop_in'].includes(body.billingCycle)) {
    try {
      const provider = await getProviderForGym(gymId)
      const plan     = await provider.createPlan({
        name:     body.name,
        amount:   body.price,
        currency,
        interval: body.billingCycle as any,
      })
      stripePriceId = plan.providerId
    } catch (err: any) {
      logger.warn('Could not create plan on payment provider', { error: err.message })
    }
  }

  const row = await tenantQuery(gymId, `
    INSERT INTO membership_plans
      (gym_id, name, description, price, billing_cycle,
       duration_days, class_credits, access_all_locations,
       access_location_ids, is_public, sort_order,
       stripe_price_id, stripe_product_id,
       has_hour_restrictions, operating_hours, discounts)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *
  `, [
    gymId,
    body.name,
    body.description    ?? null,
    body.price,
    body.billingCycle,
    body.durationDays   ?? null,
    body.classCredits   ?? null,
    body.accessAllLocations,
    body.accessLocationIds ?? null,
    body.isPublic,
    body.sortOrder,
    stripePriceId,
    stripeProductId,
    body.hasHourRestrictions ?? false,
    body.operatingHours ? JSON.stringify(body.operatingHours) : null,
    JSON.stringify(body.discounts ?? []),
  ])

  created(res, row.rows[0])
})

// =============================================================================
// GET /plans/:id
// =============================================================================

plansRouter.get('/:id', can('subscriptions:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT
      p.*,
      COUNT(ms.id) FILTER (WHERE ms.status = 'active')::int AS active_subscriptions,
      COALESCE(SUM(ms.price_paid) FILTER (WHERE ms.status = 'active'), 0)::numeric(10,2) AS mrr
    FROM   membership_plans p
    LEFT   JOIN member_subscriptions ms ON ms.plan_id = p.id
    WHERE  p.id = $1 AND p.gym_id = $2
    GROUP  BY p.id
  `, [req.params.id, req.gymId])

  if (!row.rows[0]) throw new NotFoundError('Plan', req.params.id)
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /plans/:id
// =============================================================================

plansRouter.patch('/:id', can('plans:manage'), async (req: Request, res: Response) => {
  const body   = UpdatePlanSchema.parse(req.body)
  const gymId  = req.gymId
  const planId = req.params.id

  // Block price/cycle changes if members are active on plan
  if (body.price !== undefined || body.billingCycle !== undefined) {
    const active = await tenantQuery(gymId,
      `SELECT COUNT(*)::int AS count FROM member_subscriptions
       WHERE plan_id = $1 AND status = 'active'`,
      [planId]
    )
    if ((active.rows[0]?.count ?? 0) > 0) {
      throw new ConflictError(
        'Cannot change price or billing cycle while members are on this plan. Archive it and create a new one.'
      )
    }
  }

  const fieldMap: Record<string, unknown> = {
    name:                 body.name,
    description:          body.description,
    price:                body.price,
    billing_cycle:        body.billingCycle,
    duration_days:        body.durationDays,
    class_credits:        body.classCredits,
    access_all_locations: body.accessAllLocations,
    access_location_ids:  body.accessLocationIds,
    is_public:            body.isPublic,
    sort_order:           body.sortOrder,
    has_hour_restrictions: body.hasHourRestrictions,
    operating_hours:      body.operatingHours !== undefined
                            ? (body.operatingHours ? JSON.stringify(body.operatingHours) : null)
                            : undefined,
    discounts:            body.discounts !== undefined
                            ? JSON.stringify(body.discounts)
                            : undefined,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  const row = await tenantQuery(gymId,
    `UPDATE membership_plans SET ${set}, updated_at = NOW()
     WHERE id = $${values.length + 1} AND gym_id = $${values.length + 2}
     RETURNING *`,
    [...values, planId, gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Plan', planId)
  ok(res, row.rows[0])
})

// =============================================================================
// POST /plans/:id/archive
// =============================================================================

plansRouter.post('/:id/archive', can('plans:manage'), async (req: Request, res: Response) => {
  const gymId  = req.gymId
  const planId = req.params.id

  const active = await tenantQuery(gymId,
    `SELECT COUNT(*)::int AS count FROM member_subscriptions
     WHERE plan_id = $1 AND status = 'active'`,
    [planId]
  )
  if ((active.rows[0]?.count ?? 0) > 0) {
    throw new ConflictError(
      'Cannot archive a plan with active subscriptions. Move members to another plan first.'
    )
  }

  await tenantQuery(gymId,
    `UPDATE membership_plans SET archived_at = NOW(), is_public = FALSE
     WHERE id = $1 AND gym_id = $2`,
    [planId, gymId]
  )

  ok(res, { message: 'Plan archived' })
})

// =============================================================================
// GET /plans/public/:gymSlug  — no auth, for widget/signup page
// =============================================================================

plansRouter.get('/public/:gymSlug', async (req: Request, res: Response) => {
  const { tenantQuery: tq, query } = await import('@/db/pool')

  const gymRow = await query(
    `SELECT id FROM gyms WHERE slug = $1 AND subscription_status != 'suspended'`,
    [req.params.gymSlug]
  )
  if (!gymRow.rows[0]) throw new NotFoundError('Gym')

  const rows = await tq(gymRow.rows[0].id, `
    SELECT id, name, description, price, billing_cycle,
           duration_days, class_credits, sort_order,
           discounts, has_hour_restrictions
    FROM   membership_plans
    WHERE  gym_id = $1 AND is_public = TRUE AND archived_at IS NULL
    ORDER  BY sort_order ASC, price ASC
  `, [gymRow.rows[0].id])

  ok(res, rows.rows)
})