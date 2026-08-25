import { Router, Request, Response } from 'express'
import { z } from 'zod'
import Stripe from 'stripe'
import { tenantQuery, withTransaction } from '@/db/pool'
import { query } from '@/db/pool'
import { authenticate, resolveTenant, can, isMember, paginate } from '@/middleware'
import {
  ok, created, paginated,
  NotFoundError, ConflictError, ValidationError, AppError,
} from '@/utils/errors'
import { env } from '@/config/env'
import { logger } from '@/utils/logger'
import { v4 as uuid } from 'uuid'

export const subscriptionsRouter = Router()

const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })

subscriptionsRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const AssignSchema = z.object({
  memberId:              z.string().uuid(),
  planId:                z.string().uuid(),
  startDate:             z.string().date().optional(),
  stripePaymentMethodId: z.string().optional(),
})

const FreezeSchema = z.object({
  frozenFrom:  z.string().date(),
  frozenUntil: z.string().date(),
  reason:      z.string().optional(),
})

const CancelSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
  reason:            z.string().optional(),
})

const UpgradeSchema = z.object({
  newPlanId: z.string().uuid(),
  prorate:   z.boolean().default(true),
})

// =============================================================================
// GET /subscriptions
// =============================================================================

subscriptionsRouter.get('/', can('subscriptions:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const { page, limit, offset } = paginate(req)

  const status   = req.query.status   as string | undefined
  const memberId = req.query.memberId as string | undefined

  const conditions: string[] = ['ms.gym_id = $1']
  const params: unknown[]    = [gymId]
  let p = 2

  if (status)   { conditions.push(`ms.status = $${p++}`);    params.push(status)   }
  if (memberId) { conditions.push(`ms.member_id = $${p++}`); params.push(memberId) }

  const where = conditions.join(' AND ')

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        ms.*,
        m.first_name, m.last_name, m.email,
        mp.name AS plan_name, mp.billing_cycle
      FROM   member_subscriptions ms
      JOIN   members          m  ON m.id  = ms.member_id
      JOIN   membership_plans mp ON mp.id = ms.plan_id
      WHERE  ${where}
      ORDER  BY ms.created_at DESC
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM member_subscriptions ms WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// POST /subscriptions  — assign a plan to a member
// =============================================================================

subscriptionsRouter.post('/', can('subscriptions:create'), async (req: Request, res: Response) => {
  const body  = AssignSchema.parse(req.body)
  const gymId = req.gymId

  let subscription: { id: string }

  try {
    subscription = await withTransaction(gymId, async (db) => {

      // 1. Verify member
      const memberResult = await db.query<{ id: string; email: string }>(
        `SELECT id, email FROM members WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
        [body.memberId, gymId]
      )
      if (!memberResult.rows[0]) throw new NotFoundError('Member', body.memberId)
      const member = memberResult.rows[0]

      // 2. Verify plan
      const planResult = await db.query<{
        id: string; name: string; price: string; billing_cycle: string;
        duration_days: number | null; class_credits: number | null;
        stripe_price_id: string | null;
      }>(
        `SELECT id, name, price, billing_cycle, duration_days,
                class_credits, stripe_price_id
         FROM   membership_plans
         WHERE  id = $1 AND gym_id = $2 AND archived_at IS NULL`,
        [body.planId, gymId]
      )
      if (!planResult.rows[0]) throw new NotFoundError('Plan', body.planId)
      const plan = planResult.rows[0]
      const planPrice = Number(plan.price)

      // 3. Check no active subscription already exists
      const existingResult = await db.query(
        `SELECT id FROM member_subscriptions WHERE member_id = $1 AND status = 'active'`,
        [body.memberId]
      )
      if (existingResult.rows[0]) throw new ConflictError('Member already has an active subscription')

      // 4. Calculate dates
      const startDate = body.startDate ? new Date(body.startDate) : new Date()
      const endDate   = plan.duration_days
        ? new Date(startDate.getTime() + plan.duration_days * 86_400_000)
        : null

      // 5. Get gym currency
      const gymResult = await db.query<{ currency: string }>(
        `SELECT currency FROM gyms WHERE id = $1`, [gymId]
      )
      const currency = gymResult.rows[0]?.currency ?? 'NGN'

      // 6. Skip Stripe for now — no stripe_price_id configured
      // Stripe integration will be wired when payment provider is connected

      // 7. Insert subscription record
      const subResult = await db.query<{ id: string }>(`
        INSERT INTO member_subscriptions
          (gym_id, member_id, plan_id, status,
           start_date, end_date, next_billing_date,
           credits_total, credits_remaining,
           price_paid, currency,
           stripe_subscription_id, auto_renew)
        VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$7,$8,$9,NULL,true)
        RETURNING id
      `, [
        gymId,
        body.memberId,
        plan.id,
        startDate,
        endDate,
        endDate ?? null,
        plan.class_credits,
        planPrice,
        currency,
      ])

      if (!subResult.rows[0]) throw new AppError(500, 'INSERT_FAILED', 'Failed to create subscription')
      const sub = subResult.rows[0]

      // 8. Create a pending payment so Member Owes reflects the amount due
      if (planPrice > 0) {
        const idempotencyKey = `subscription_${gymId}_${body.memberId}_${sub.id}`
        await db.query(`
          INSERT INTO payments
            (gym_id, member_id, subscription_id, type, status,
             amount, currency, description, payment_method, idempotency_key)
          VALUES ($1, $2, $3, 'subscription', 'pending', $4, $5, $6, 'other', $7)
          ON CONFLICT (gym_id, idempotency_key) DO NOTHING
        `, [
          gymId,
          body.memberId,
          sub.id,
          planPrice,
          currency,
          `${plan.name} — ${plan.billing_cycle}`,
          idempotencyKey,
        ])
      }

      // 9. Ensure member status is active
      await db.query(
        `UPDATE members SET status = 'active' WHERE id = $1`, [body.memberId]
      )

      return sub
    })

  } catch (err: any) {
    console.error('=== SUBSCRIPTION ERROR ===')
    console.error('Message:   ', err.message)
    console.error('Detail:    ', err.detail    ?? 'none')
    console.error('Constraint:', err.constraint ?? 'none')
    console.error('Code:      ', err.code       ?? 'none')
    console.error('=========================')
    throw err
  }

  const full = await tenantQuery(gymId, `
    SELECT ms.*, mp.name AS plan_name, mp.billing_cycle
    FROM   member_subscriptions ms
    JOIN   membership_plans mp ON mp.id = ms.plan_id
    WHERE  ms.id = $1
  `, [subscription!.id])

  logger.info('Subscription assigned', { gymId, subscriptionId: subscription!.id })

  created(res, full.rows[0])
})

// =============================================================================
// GET /subscriptions/:id
// =============================================================================

subscriptionsRouter.get('/:id', can('subscriptions:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT
      ms.*,
      mp.name          AS plan_name,
      mp.billing_cycle,
      mp.price         AS plan_price,
      m.first_name, m.last_name, m.email
    FROM   member_subscriptions ms
    JOIN   membership_plans mp ON mp.id = ms.plan_id
    JOIN   members          m  ON m.id  = ms.member_id
    WHERE  ms.id = $1
  `, [req.params.id])

  if (!row.rows[0]) throw new NotFoundError('Subscription', req.params.id)
  ok(res, row.rows[0])
})

// =============================================================================
// POST /subscriptions/:id/freeze
// =============================================================================

subscriptionsRouter.post('/:id/freeze', can('subscriptions:edit'), async (req: Request, res: Response) => {
  const body  = FreezeSchema.parse(req.body)
  const gymId = req.gymId
  const subId = req.params.id

  const frozenFrom  = new Date(body.frozenFrom)
  const frozenUntil = new Date(body.frozenUntil)

  if (frozenUntil <= frozenFrom) {
    throw new ValidationError('frozenUntil must be after frozenFrom')
  }

  await withTransaction(gymId, async (db) => {
    const sub = await db.one<{
      id: string; status: string; end_date: string | null;
      stripe_subscription_id: string | null
    }>(
      `SELECT id, status, end_date, stripe_subscription_id
       FROM   member_subscriptions WHERE id = $1 FOR UPDATE`,
      [subId]
    )
    if (!sub) throw new NotFoundError('Subscription', subId)
    if (sub.status !== 'active') {
      throw new ValidationError(`Cannot freeze a subscription with status '${sub.status}'`)
    }

    const freezeDays = Math.ceil(
      (frozenUntil.getTime() - frozenFrom.getTime()) / 86_400_000
    )

    await db.query(`
      UPDATE member_subscriptions
      SET    status       = 'frozen',
             frozen_from  = $1,
             frozen_until = $2,
             end_date     = CASE
               WHEN end_date IS NOT NULL
               THEN end_date + ($3 || ' days')::interval
               ELSE NULL
             END
      WHERE  id = $4
    `, [frozenFrom, frozenUntil, freezeDays, subId])

    if (sub.stripe_subscription_id) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: { behavior: 'void' },
      })
    }
  })

  ok(res, { message: 'Subscription frozen' })
})

// =============================================================================
// POST /subscriptions/:id/unfreeze
// =============================================================================

subscriptionsRouter.post('/:id/unfreeze', can('subscriptions:edit'), async (req: Request, res: Response) => {
  const gymId = req.gymId
  const subId = req.params.id

  await withTransaction(gymId, async (db) => {
    const sub = await db.one<{
      id: string; status: string; stripe_subscription_id: string | null
    }>(
      `SELECT id, status, stripe_subscription_id
       FROM   member_subscriptions WHERE id = $1 FOR UPDATE`,
      [subId]
    )
    if (!sub) throw new NotFoundError('Subscription', subId)
    if (sub.status !== 'frozen') {
      throw new ValidationError('Subscription is not currently frozen')
    }

    await db.query(`
      UPDATE member_subscriptions
      SET status = 'active', frozen_from = NULL, frozen_until = NULL
      WHERE id = $1
    `, [subId])

    if (sub.stripe_subscription_id) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        pause_collection: '',
      } as any)
    }
  })

  ok(res, { message: 'Subscription unfrozen' })
})

// =============================================================================
// POST /subscriptions/:id/cancel
// =============================================================================

subscriptionsRouter.post('/:id/cancel', can('subscriptions:cancel'), async (req: Request, res: Response) => {
  const body  = CancelSchema.parse(req.body)
  const gymId = req.gymId
  const subId = req.params.id

  await withTransaction(gymId, async (db) => {
    const sub = await db.one<{
      id: string; status: string; member_id: string;
      stripe_subscription_id: string | null
    }>(
      `SELECT id, status, member_id, stripe_subscription_id
       FROM   member_subscriptions WHERE id = $1 FOR UPDATE`,
      [subId]
    )
    if (!sub) throw new NotFoundError('Subscription', subId)
    if (sub.status === 'cancelled') {
      throw new ValidationError('Subscription is already cancelled')
    }

    if (body.cancelAtPeriodEnd) {
      await db.query(`
        UPDATE member_subscriptions
        SET cancel_at_period_end = TRUE, cancellation_reason = $1
        WHERE id = $2
      `, [body.reason ?? null, subId])
    } else {
      await db.query(`
        UPDATE member_subscriptions
        SET    status               = 'cancelled',
               cancelled_at        = NOW(),
               cancel_at_period_end = FALSE,
               cancellation_reason  = $1
        WHERE  id = $2
      `, [body.reason ?? null, subId])

      const others = await db.one<{ count: string }>(
        `SELECT COUNT(*) AS count FROM member_subscriptions
         WHERE member_id = $1 AND status = 'active'`,
        [sub.member_id]
      )
      if (parseInt(others?.count ?? '0') === 0) {
        await db.query(
          `UPDATE members SET status = 'inactive' WHERE id = $1`, [sub.member_id]
        )
      }
    }

    if (sub.stripe_subscription_id) {
      if (body.cancelAtPeriodEnd) {
        await stripe.subscriptions.update(sub.stripe_subscription_id, {
          cancel_at_period_end: true,
        })
      } else {
        await stripe.subscriptions.cancel(sub.stripe_subscription_id)
      }
    }
  })

  ok(res, {
    message: body.cancelAtPeriodEnd
      ? 'Subscription will cancel at period end'
      : 'Subscription cancelled',
  })
})

// =============================================================================
// POST /subscriptions/:id/upgrade
// =============================================================================

subscriptionsRouter.post('/:id/upgrade', can('subscriptions:edit'), async (req: Request, res: Response) => {
  const body  = UpgradeSchema.parse(req.body)
  const gymId = req.gymId
  const subId = req.params.id

  await withTransaction(gymId, async (db) => {
    const sub = await db.one<{
      id: string; status: string; stripe_subscription_id: string | null; plan_id: string
    }>(
      `SELECT id, status, stripe_subscription_id, plan_id
       FROM   member_subscriptions WHERE id = $1 FOR UPDATE`,
      [subId]
    )
    if (!sub) throw new NotFoundError('Subscription', subId)
    if (sub.status !== 'active') {
      throw new ValidationError('Only active subscriptions can be upgraded')
    }
    if (sub.plan_id === body.newPlanId) {
      throw new ConflictError('Member is already on this plan')
    }

    const newPlan = await db.one<{
      id: string; name: string; price: number; class_credits: number | null;
      stripe_price_id: string | null
    }>(
      `SELECT id, name, price, class_credits, stripe_price_id
       FROM   membership_plans WHERE id = $1 AND gym_id = $2 AND archived_at IS NULL`,
      [body.newPlanId, gymId]
    )
    if (!newPlan) throw new NotFoundError('Plan', body.newPlanId)

    await db.query(`
      UPDATE member_subscriptions
      SET plan_id = $1, credits_total = $2, credits_remaining = $2
      WHERE id = $3
    `, [body.newPlanId, newPlan.class_credits, subId])

    // Create pending payment for the new plan price
    if (newPlan.price > 0) {
      const gymRow = await db.one<{ currency: string }>(
        `SELECT currency FROM gyms WHERE id = $1`, [gymId]
      )
      const idempotencyKey = `upgrade_${gymId}_${subId}_${body.newPlanId}`
      await db.query(`
        INSERT INTO payments
          (gym_id, member_id, subscription_id, type, status,
           amount, currency, description, payment_method, idempotency_key)
        SELECT $1, ms.member_id, $2, 'subscription', 'pending',
               $3, $4, $5, 'other', $6
        FROM   member_subscriptions ms WHERE ms.id = $2
        ON CONFLICT (gym_id, idempotency_key) DO NOTHING
      `, [
        gymId, subId, newPlan.price,
        gymRow?.currency ?? 'NGN',
        `Upgrade to ${newPlan.name}`,
        idempotencyKey,
      ])
    }

    if (sub.stripe_subscription_id && newPlan.stripe_price_id) {
      const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        items: [{ id: stripeSub.items.data[0].id, price: newPlan.stripe_price_id }],
        proration_behavior: body.prorate ? 'create_prorations' : 'none',
      })
    }
  })

  ok(res, { message: 'Subscription upgraded' })
})

// =============================================================================
// GET /subscriptions/me
// =============================================================================

subscriptionsRouter.get('/me', isMember, async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT
      ms.*,
      mp.name AS plan_name, mp.billing_cycle,
      mp.price, mp.class_credits AS plan_credits
    FROM   member_subscriptions ms
    JOIN   membership_plans mp ON mp.id = ms.plan_id
    WHERE  ms.member_id = $1 AND ms.status IN ('active','frozen','past_due')
    ORDER  BY ms.created_at DESC
    LIMIT  1
  `, [req.memberId])

  ok(res, row.rows[0] ?? null)
})

// =============================================================================
// GET /subscriptions/plans
// =============================================================================

subscriptionsRouter.get('/plans', can('subscriptions:read'), async (req: Request, res: Response) => {
  const rows = await tenantQuery(req.gymId, `
    SELECT * FROM membership_plans
    WHERE gym_id = $1 AND archived_at IS NULL
    ORDER BY sort_order ASC, created_at ASC
  `, [req.gymId])

  ok(res, rows.rows)
})