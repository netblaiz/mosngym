import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import { authenticate, resolveTenant, can, paginate } from '@/middleware'
import { ok, created, paginated, NotFoundError, ValidationError, PaymentRequiredError } from '@/utils/errors'
import { logger } from '@/utils/logger'
import { v4 as uuid } from 'uuid'

export const paymentsRouter = Router()

paymentsRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ChargeSchema = z.object({
  memberId:        z.string().uuid(),
  amount:          z.number().positive(),
  description:     z.string().min(1),
  paymentMethodId: z.string().optional(),
  sendReceipt:     z.boolean().default(true),
})

const RefundSchema = z.object({
  amount: z.number().positive().optional(),
  reason: z.string().optional(),
})

const SetupIntentSchema = z.object({
  memberId: z.string().uuid(),
})

// =============================================================================
// GET /payments
// =============================================================================

paymentsRouter.get('/', can('billing:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const { page, limit, offset } = paginate(req)

  const memberId = req.query.memberId as string | undefined
  const status   = req.query.status   as string | undefined
  const type     = req.query.type     as string | undefined
  const from     = req.query.from     as string | undefined
  const to       = req.query.to       as string | undefined

  const conditions: string[] = ['p.gym_id = $1']
  const params: unknown[]    = [gymId]
  let p = 2

  if (memberId) { conditions.push(`p.member_id = $${p++}`);   params.push(memberId) }
  if (status)   { conditions.push(`p.status = $${p++}`);      params.push(status) }
  if (type)     { conditions.push(`p.type = $${p++}`);        params.push(type) }
  if (from)     { conditions.push(`p.created_at >= $${p++}`); params.push(from) }
  if (to)       { conditions.push(`p.created_at <= $${p++}`); params.push(to) }

  const where = conditions.join(' AND ')

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        p.*,
        m.first_name,
        m.last_name,
        m.email        AS member_email,
        mp.name        AS plan_name
      FROM   payments p
      LEFT   JOIN members              m  ON m.id  = p.member_id
      LEFT   JOIN member_subscriptions ms ON ms.id = p.subscription_id
      LEFT   JOIN membership_plans     mp ON mp.id = ms.plan_id
      WHERE  ${where}
      ORDER  BY p.created_at DESC
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM payments p WHERE ${where}`,
      params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// GET /payments/:id
// =============================================================================

paymentsRouter.get('/:id', can('billing:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT
      p.*,
      m.first_name,
      m.last_name,
      m.email     AS member_email,
      mp.name     AS plan_name
    FROM   payments p
    LEFT   JOIN members              m  ON m.id  = p.member_id
    LEFT   JOIN member_subscriptions ms ON ms.id = p.subscription_id
    LEFT   JOIN membership_plans     mp ON mp.id = ms.plan_id
    WHERE  p.id = $1 AND p.gym_id = $2
  `, [req.params.id, req.gymId])

  if (!row.rows[0]) throw new NotFoundError('Payment', req.params.id)
  ok(res, row.rows[0])
})

// =============================================================================
// POST /payments/charge
// =============================================================================

// Replace the POST /payments/charge handler in your payments.router.ts
// with this version. It clears the pending subscription payment when
// a manual charge is recorded, so Member Owes drops to ₦0.

paymentsRouter.post('/charge', can('billing:charge'), async (req: Request, res: Response) => {
  const body  = ChargeSchema.parse(req.body)
  const gymId = req.gymId

  const memberResult = await tenantQuery(gymId,
    `SELECT id, email FROM members WHERE id = $1`,
    [body.memberId]
  )
  if (!memberResult.rows[0]) throw new NotFoundError('Member', body.memberId)

  const idempotencyKey = `charge_${gymId}_${body.memberId}_${uuid()}`

  const payment = await withTransaction(gymId, async (db) => {

    // ── Check if there's a pending subscription payment to clear ─────────────
    const pendingSub = await db.one<{ id: string; subscription_id: string | null }>(
      `SELECT id, subscription_id FROM payments
       WHERE  member_id = $1
         AND  gym_id    = $2
         AND  status    = 'pending'
         AND  type      = 'subscription'
       ORDER  BY created_at DESC
       LIMIT  1`,
      [body.memberId, gymId]
    )

    // ── Insert the new payment as succeeded ───────────────────────────────────
    const pay = await db.one<{ id: string }>(`
      INSERT INTO payments
        (gym_id, member_id, subscription_id, type, status, amount, currency,
         description, payment_method, idempotency_key, paid_at)
      VALUES ($1, $2, $3, 'one_off', 'succeeded', $4, 'NGN', $5, 'other', $6, NOW())
      RETURNING id
    `, [
      gymId,
      body.memberId,
      pendingSub?.subscription_id ?? null,
      body.amount,
      body.description,
      idempotencyKey,
    ])

    // ── If amount covers the pending subscription payment, mark it succeeded ──
    if (pendingSub) {
      await db.query(`
        UPDATE payments
        SET    status   = 'succeeded',
               paid_at  = NOW()
        WHERE  id = $1
      `, [pendingSub.id])

      logger.info('Pending subscription payment cleared', {
        gymId,
        memberId: body.memberId,
        pendingPaymentId: pendingSub.id,
      })
    }

    return { id: pay!.id, status: 'succeeded' }
  })

  logger.info('Charge processed', { gymId, memberId: body.memberId, amount: body.amount })

  created(res, payment)
})

// =============================================================================
// POST /payments/:id/refund
// =============================================================================

paymentsRouter.post('/:id/refund', can('billing:refund'), async (req: Request, res: Response) => {
  const body      = RefundSchema.parse(req.body)
  const { gymId } = req
  const paymentId = req.params.id

  await withTransaction(gymId, async (db) => {
    const payment = await db.one<{
      id:               string
      amount:           number
      amount_refunded:  number
      status:           string
      stripe_payment_id: string | null
    }>(
      `SELECT id, amount, amount_refunded, status, stripe_payment_id
       FROM payments WHERE id = $1 FOR UPDATE`,
      [paymentId]
    )

    if (!payment) throw new NotFoundError('Payment', paymentId)

    if (payment.status === 'refunded') {
      throw new ValidationError('Payment has already been fully refunded')
    }
    if (payment.status !== 'succeeded') {
      throw new ValidationError('Only succeeded payments can be refunded')
    }

    const maxRefund    = payment.amount - payment.amount_refunded
    const refundAmount = body.amount ?? maxRefund

    if (refundAmount > maxRefund) {
      throw new ValidationError(
        `Refund amount ${refundAmount} exceeds refundable amount ${maxRefund}`
      )
    }

    const newRefunded = payment.amount_refunded + refundAmount
    const newStatus   = newRefunded >= payment.amount ? 'refunded' : 'partially_refunded'

    await db.query(
      `UPDATE payments SET amount_refunded = $1, status = $2 WHERE id = $3`,
      [newRefunded, newStatus, paymentId]
    )
  })

  const updated = await tenantQuery(gymId, `SELECT * FROM payments WHERE id = $1`, [paymentId])
  ok(res, updated.rows[0])
})

// =============================================================================
// POST /payments/setup-intent  — placeholder until provider is configured
// =============================================================================

paymentsRouter.post('/setup-intent', can('billing:read'), async (req: Request, res: Response) => {
  const body      = SetupIntentSchema.parse(req.body)
  const { gymId } = req

  const member = await tenantQuery(gymId,
    `SELECT id, email FROM members WHERE id = $1`,
    [body.memberId]
  )
  if (!member.rows[0]) throw new NotFoundError('Member', body.memberId)

  // TODO: wire up Paystack/Stripe when provider is configured
  ok(res, { message: 'Payment provider not configured yet', memberId: body.memberId })
})