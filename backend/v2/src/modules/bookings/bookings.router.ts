import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import { authenticate, resolveTenant, can, isMember, paginate } from '@/middleware'
import { ok, created, paginated, NotFoundError, ConflictError, ValidationError, AppError } from '@/utils/errors'
import { logger } from '@/utils/logger'

export const bookingsRouter = Router()

bookingsRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateBookingSchema = z.object({
  sessionId: z.string().uuid(),
  memberId:  z.string().uuid().optional(), // staff can book on behalf of a member
})

const CancelBookingSchema = z.object({
  reason: z.string().optional(),
})

// =============================================================================
// POST /bookings  — book a class session
// The most critical write in the whole API.
// Uses SELECT FOR UPDATE to lock the session row and prevent overbooking
// under concurrent load. Credits are deducted in the same transaction.
// =============================================================================

bookingsRouter.post('/', async (req: Request, res: Response) => {
  const body = CreateBookingSchema.parse(req.body)
  const gymId = req.gymId

  // Resolve who we're booking for
  const targetMemberId = body.memberId ?? req.memberId
  if (!targetMemberId) {
    throw new ValidationError('memberId is required')
  }

  // Staff booking on behalf of someone else
  if (body.memberId && body.memberId !== req.memberId && !req.staffId) {
    throw new ValidationError('Only staff can book on behalf of another member')
  }

  const booking = await withTransaction(gymId, async (db) => {

    // ── 1. Lock the session row ───────────────────────────────────────────────
    // FOR UPDATE prevents two concurrent requests from both reading "9/10 spots"
    // and both inserting a confirmed booking, exceeding capacity
    const session = await db.one<{
      id: string; capacity: number; starts_at: Date; status: string;
      requires_credits: number
    }>(`
      SELECT cs.id, cs.capacity, cs.starts_at, cs.status,
             ct.requires_credits
      FROM   class_sessions  cs
      JOIN   class_templates ct ON ct.id = cs.template_id
      WHERE  cs.id = $1 AND cs.gym_id = $2
      FOR UPDATE
    `, [body.sessionId, gymId])

    if (!session) throw new NotFoundError('Class session', body.sessionId)
    if (session.status === 'cancelled') {
      throw new ValidationError('This class has been cancelled')
    }
    if (new Date(session.starts_at) < new Date()) {
      throw new ValidationError('Cannot book a class that has already started')
    }

    // ── 2. Check for duplicate booking ───────────────────────────────────────
    const existing = await db.one(
      `SELECT id, status FROM bookings
       WHERE member_id = $1 AND session_id = $2`,
      [targetMemberId, body.sessionId]
    )
    if (existing) throw new ConflictError('Member already has a booking for this session')

    // ── 3. Count confirmed spots (within the lock) ────────────────────────────
    const occupancy = await db.one<{ confirmed: string; waitlisted: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'confirmed')::text  AS confirmed,
         COUNT(*) FILTER (WHERE status = 'waitlisted')::text AS waitlisted
       FROM bookings WHERE session_id = $1`,
      [body.sessionId]
    )
    const confirmedCount  = parseInt(occupancy?.confirmed  ?? '0')
    const waitlistedCount = parseInt(occupancy?.waitlisted ?? '0')
    const isFull          = confirmedCount >= session.capacity

    // ── 4. Check membership and credits ──────────────────────────────────────
    let subscriptionId: string | null = null

    if (session.requires_credits > 0) {
      const sub = await db.one<{ id: string; credits_remaining: number | null }>(`
        SELECT id, credits_remaining
        FROM   member_subscriptions
        WHERE  member_id = $1 AND gym_id = $2 AND status = 'active'
          AND  (end_date IS NULL OR end_date >= CURRENT_DATE)
          AND  (frozen_from IS NULL
                OR CURRENT_DATE < frozen_from
                OR CURRENT_DATE > frozen_until)
        ORDER  BY end_date ASC NULLS LAST
        LIMIT  1
      `, [targetMemberId, gymId])

      if (!sub) {
        throw new AppError(402, 'NO_ACTIVE_SUBSCRIPTION',
          'Member does not have an active membership')
      }

      // Only enforce credit balance for a confirmed spot, not waitlist
      if (!isFull
          && sub.credits_remaining !== null
          && sub.credits_remaining < session.requires_credits) {
        throw new AppError(402, 'INSUFFICIENT_CREDITS',
          `This class requires ${session.requires_credits} credit(s). ` +
          `Member has ${sub.credits_remaining}.`)
      }

      subscriptionId = sub.id
    }

    // ── 5. Insert booking ─────────────────────────────────────────────────────
    const status          = isFull ? 'waitlisted' : 'confirmed'
    const waitlistPosition = isFull ? waitlistedCount + 1 : null
    const creditsUsed     = status === 'confirmed' ? session.requires_credits : 0

    const newBooking = await db.one<{ id: string }>(`
      INSERT INTO bookings
        (gym_id, member_id, session_id, subscription_id,
         status, waitlist_position, credits_used)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `, [gymId, targetMemberId, body.sessionId, subscriptionId,
        status, waitlistPosition, creditsUsed])

    // ── 6. Deduct credits for confirmed bookings only ─────────────────────────
    if (status === 'confirmed' && subscriptionId && session.requires_credits > 0) {
      await db.query(
        `UPDATE member_subscriptions
         SET    credits_remaining = credits_remaining - $1
         WHERE  id = $2`,
        [session.requires_credits, subscriptionId]
      )
    }

    logger.info('Booking created', {
      gymId, memberId: targetMemberId,
      sessionId: body.sessionId, status,
    })

    return { id: newBooking!.id, status, waitlistPosition }
  })

  // TODO: emit booking.confirmed or booking.waitlisted → automation

  created(res, booking)
})

// =============================================================================
// DELETE /bookings/:id  — cancel a booking
// Refunds credits if outside the cancellation window.
// Promotes the next person on the waitlist if a confirmed spot opens.
// =============================================================================

bookingsRouter.delete('/:id', async (req: Request, res: Response) => {
  const body      = CancelBookingSchema.parse(req.body)
  const gymId     = req.gymId
  const bookingId = req.params.id

  await withTransaction(gymId, async (db) => {

    // Lock booking + fetch session start time
    const booking = await db.one<{
      id: string; member_id: string; session_id: string; status: string;
      credits_used: number; subscription_id: string | null; starts_at: Date
    }>(`
      SELECT b.*, cs.starts_at
      FROM   bookings       b
      JOIN   class_sessions cs ON cs.id = b.session_id
      WHERE  b.id = $1 AND b.gym_id = $2
      FOR UPDATE OF b
    `, [bookingId, gymId])

    if (!booking) throw new NotFoundError('Booking', bookingId)
    if (booking.status === 'cancelled') {
      throw new ValidationError('Booking is already cancelled')
    }

    // Members can only cancel their own bookings
    if (req.memberId && req.memberId !== booking.member_id) {
      throw new ValidationError("Cannot cancel another member's booking")
    }

    // ── Credit refund logic ───────────────────────────────────────────────────
    // Refund if outside the gym's cancellation window
    const settings = await db.one<{ cancel_window_hrs: number }>(
      `SELECT cancel_window_hrs FROM gym_settings WHERE gym_id = $1`, [gymId]
    )
    const windowMs      = (settings?.cancel_window_hrs ?? 2) * 3_600_000
    const outsideWindow = Date.now() + windowMs <= new Date(booking.starts_at).getTime()
    const shouldRefund  = outsideWindow && booking.credits_used > 0

    // ── Cancel the booking ────────────────────────────────────────────────────
    await db.query(`
      UPDATE bookings
      SET    status              = 'cancelled',
             cancelled_at        = NOW(),
             cancelled_by_id     = $1,
             cancellation_reason = $2,
             credits_refunded_at = $3
      WHERE  id = $4
    `, [
      req.staffId ?? null,
      body.reason ?? null,
      shouldRefund ? new Date() : null,
      bookingId,
    ])

    // ── Refund credits ────────────────────────────────────────────────────────
    if (shouldRefund && booking.subscription_id) {
      await db.query(
        `UPDATE member_subscriptions
         SET    credits_remaining = credits_remaining + $1
         WHERE  id = $2`,
        [booking.credits_used, booking.subscription_id]
      )
    }

    // ── Promote next on waitlist (only if a confirmed spot opened) ────────────
    if (booking.status === 'confirmed') {
      const next = await db.one<{ id: string; member_id: string }>(
        `SELECT id, member_id FROM bookings
         WHERE  session_id = $1 AND status = 'waitlisted'
         ORDER  BY waitlist_position ASC
         LIMIT  1`,
        [booking.session_id]
      )

      if (next) {
        // Promote to confirmed
        await db.query(`
          UPDATE bookings
          SET    status             = 'confirmed',
                 waitlist_position  = NULL,
                 waitlist_notified_at = NOW()
          WHERE  id = $1
        `, [next.id])

        // Shift remaining waitlist positions down by 1
        await db.query(`
          UPDATE bookings
          SET    waitlist_position = waitlist_position - 1
          WHERE  session_id = $1 AND status = 'waitlisted'
        `, [booking.session_id])

        // TODO: emit booking.promoted → push notification to promoted member
        logger.info('Waitlist member promoted', {
          gymId, memberId: next.member_id, sessionId: booking.session_id,
        })
      }
    }
  })

  // TODO: emit booking.cancelled → automation
  ok(res, { message: 'Booking cancelled' })
})

// =============================================================================
// GET /bookings/me  — member's upcoming bookings
// =============================================================================

bookingsRouter.get('/me', isMember, async (req: Request, res: Response) => {
  const { gymId, memberId }     = req
  const { page, limit, offset } = paginate(req)

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        b.id, b.status, b.waitlist_position, b.booked_at, b.checked_in_at,
        cs.starts_at, cs.ends_at,
        ct.name  AS class_name,
        ct.color,
        gl.name  AS location_name
      FROM   bookings       b
      JOIN   class_sessions cs ON cs.id = b.session_id
      JOIN   class_templates ct ON ct.id = cs.template_id
      JOIN   gym_locations   gl ON gl.id = cs.location_id
      WHERE  b.member_id = $1
        AND  cs.starts_at > NOW()
        AND  b.status NOT IN ('cancelled')
      ORDER  BY cs.starts_at ASC
      LIMIT  $2 OFFSET $3
    `, [memberId, limit, offset]),

    tenantQuery<{ count: string }>(gymId, `
      SELECT COUNT(*) FROM bookings b
      JOIN class_sessions cs ON cs.id = b.session_id
      WHERE b.member_id = $1 AND cs.starts_at > NOW() AND b.status != 'cancelled'
    `, [memberId]),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// GET /bookings  — all bookings for a gym (staff)
// =============================================================================

bookingsRouter.get('/', can('bookings:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const { page, limit, offset } = paginate(req)

  const sessionId = req.query.sessionId as string | undefined
  const memberId  = req.query.memberId  as string | undefined
  const status    = req.query.status    as string | undefined

  const conditions: string[] = ['b.gym_id = $1']
  const params: unknown[]    = [gymId]
  let p = 2

  if (sessionId) { conditions.push(`b.session_id = $${p++}`); params.push(sessionId) }
  if (memberId)  { conditions.push(`b.member_id  = $${p++}`); params.push(memberId) }
  if (status)    { conditions.push(`b.status     = $${p++}`); params.push(status) }

  const where = conditions.join(' AND ')

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        b.*,
        m.first_name, m.last_name, m.email,
        ct.name AS class_name, cs.starts_at
      FROM   bookings       b
      JOIN   members        m  ON m.id  = b.member_id
      JOIN   class_sessions cs ON cs.id = b.session_id
      JOIN   class_templates ct ON ct.id = cs.template_id
      WHERE  ${where}
      ORDER  BY b.booked_at DESC
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM bookings b WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})