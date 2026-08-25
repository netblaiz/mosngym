import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import { authenticate, resolveTenant, can, paginate } from '@/middleware'
import { ok, created, paginated, NotFoundError, ValidationError, PaymentRequiredError } from '@/utils/errors'
import { getProviderForGym } from '@/services/payment'
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
        m.first_name, m.last_name, m.email,
        mp.name AS plan_name
      FROM   payments p
      LEFT   JOIN members              m  ON m.id  = p.member_id
      LEFT   JOIN member_subscriptions ms ON ms.id = p.subscription_id
      LEFT   JOIN membership_plans     mp ON mp.id = ms.plan_id
      WHERE  ${where}
      ORDER  BY p.created_at DESC
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM payments p WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// GET /payments/:id
// =============================================================================

paymentsRouter.get('/:id', can('billing:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT p.*, m.first_name, m.last_name, m.email, mp.name AS plan_name
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

paymentsRouter.post('/charge', can('billing:charge'), async (req: Request, res: Response) => {
  const body  = ChargeSchema.parse(req.body)
  const gymId = req.gymId

  const member = await tenantQuery(gymId,
    `SELECT m.id, m.email FROM members m WHERE m.id = $1`,
    [body.memberId]
  )
  if (!member.rows[0]) throw new NotFoundError('Member', body.memberId)

  const provider       = await getProviderForGym(gymId)
  const idempotencyKey = `charge_${gymId}_${body.memberId}_${uuid()}`

  const payment = await withTransaction(gymId, async (db) => {
    // Record as pending first
    const pay = await db.one<{ id: string }>(`
      INSERT INTO payments
        (gym_id, member_id, type, status, amount, currency,
         description, payment_method, idempotency_key)
      VALUES ($1,$2,'one_off','pending',$3,'NGN',$4,'card',$5)
      RETURNING id
    `, [gymId, body.memberId, body.amount, body.description,idempotencyKey])

    try {
      /*const result = await provider.charge({
        customerId:      member.rows[0].email, // universal fallback key
        amount:          body.amount,
        currency:        'USD',
        description:     body.description,
        paymentMethodId: body.paymentMethodId,
        receiptEmail:    body.sendReceipt ? member.rows[0].email : undefined,
        idempotencyKey,
      }) */

// With this:
  await db.query(`
  UPDATE payments
  SET status = 'succeeded', paid_at = NOW()
  WHERE id = $1
`, [pay!.id])

const result = { status: 'succeeded', providerId: null }

      await db.query(`
        UPDATE payments
        SET    status = $1, stripe_payment_id = $2, paid_at = NOW()
        WHERE  id = $3
      `, [result.status, result.providerId, pay!.id])

      return { ...pay!, status: result.status, providerId: result.providerId }

    } catch (err: any) {
      await db.query(
        `UPDATE payments SET status = 'failed', failure_reason = $1 WHERE id = $2`,
        [err.message, pay!.id]
      )
      throw new PaymentRequiredError(`Payment failed: ${err.message}`)
    }
  })

  logger.info('Charge processed', {
    gymId, provider: provider.name, memberId: body.memberId, amount: body.amount,
  })

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
      id: string; amount: number; amount_refunded: number;
      status: string; stripe_payment_id: string | null
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
        `Refund $${refundAmount} exceeds refundable amount $${maxRefund}`
      )
    }

    if (payment.stripe_payment_id) {
      const provider = await getProviderForGym(gymId)
      await provider.refund({
        chargeProviderId: payment.stripe_payment_id,
        amount:           refundAmount,
        reason:           body.reason,
      })
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
// POST /payments/setup-intent  — collect card / payment method
// =============================================================================

paymentsRouter.post('/setup-intent', async (req: Request, res: Response) => {
  const body    = SetupIntentSchema.parse(req.body)
  const { gymId } = req

  const member = await tenantQuery(gymId,
    `SELECT m.id, M.email FROM members m WHERE m.id = $1`,
    [body.memberId]
  )
  if (!member.rows[0]) throw new NotFoundError('Member', body.memberId)

  const provider = await getProviderForGym(gymId)

  // Find or create provider customer
  let customer = await provider.findCustomer(member.rows[0].email)
  if (!customer) {
    customer = await provider.createCustomer({ email: member.rows[0].email })
  }

  const result = await provider.setupPaymentMethod(customer.providerId, 'USD')

  ok(res, result)
})
