import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import {
  authenticate, resolveTenant, authenticateDevice,
  can, paginate,
} from '@/middleware'
import { ok, created, paginated, NotFoundError, AppError } from '@/utils/errors'
import { logger } from '@/utils/logger'

export const checkinsRouter = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CheckInSchema = z.object({
  memberId:   z.string().uuid().optional(),
  qrCode:     z.string().optional(),
  method:     z.enum(['qr', 'ble', 'pin', 'fob', 'manual', 'app']),
  locationId: z.string().uuid(),
  bookingId:  z.string().uuid().optional(),
})

const CheckOutSchema = z.object({
  memberId:   z.string().uuid(),
  locationId: z.string().uuid(),
})

// =============================================================================
// POST /checkins
// =============================================================================

checkinsRouter.post('/',
  (req, res, next) => {
    try {
      authenticateDevice(req, res, () => next())
    } catch {
      authenticate(req, res, next)
    }
  },
  resolveTenant,
  async (req: Request, res: Response) => {
    const body  = CheckInSchema.parse(req.body)
    const gymId = req.gymId

    const memberId = body.memberId
      ?? (body.qrCode ? decodeQrCode(body.qrCode) : null)
      ?? req.memberId

    if (!memberId) {
      throw new AppError(400, 'MISSING_MEMBER', 'Could not identify member for check-in')
    }

    const result = await withTransaction(gymId, async (db) => {

      // ── 1. Load member ───────────────────────────────────────────────────────
      const member = await db.one<{
        id: string; status: string; first_name: string; last_name: string
      }>(
        `SELECT id, status, first_name, last_name FROM members
         WHERE  id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
        [memberId, gymId]
      )
      if (!member) return deny('MEMBER_NOT_FOUND', 'Member not found')
      if (member.status === 'banned') return deny('MEMBER_BANNED', 'Member access has been suspended')
      if (member.status === 'frozen') return deny('MEMBER_FROZEN', 'Membership is currently frozen')

      // ── 2. Load gym billing settings ─────────────────────────────────────────
 // ── 2. Load gym billing settings ─────────────────────────────────────────
    const settings = await db.one<{
  require_payment_for_checkin: boolean
  allow_checkin_grace_amount:  number
}>(
  `SELECT
     require_payment_for_checkin,
     checkin_grace_amount AS allow_checkin_grace_amount
   FROM gym_settings WHERE gym_id = $1`,
  [gymId]
)

      // ── 3. Check active subscription ─────────────────────────────────────────
      const sub = await db.one<{ id: string; status: string }>(
        `SELECT id, status FROM member_subscriptions
         WHERE  member_id = $1 AND status = 'active'
           AND  (end_date IS NULL OR end_date >= CURRENT_DATE)
           AND  (frozen_from IS NULL
                 OR CURRENT_DATE < frozen_from
                 OR CURRENT_DATE > frozen_until)
         LIMIT  1`,
        [memberId]
      )

      if (!sub) {
        const expired = await db.one(
          `SELECT id FROM member_subscriptions
           WHERE  member_id = $1 AND status IN ('expired','cancelled')
           ORDER  BY created_at DESC LIMIT 1`,
          [memberId]
        )
        const reason = expired ? 'MEMBERSHIP_EXPIRED' : 'NO_MEMBERSHIP'
        const msg    = expired
          ? 'Membership has expired — please renew to access the gym'
          : 'No active membership found — please sign up for a plan'
        return deny(reason, msg)
      }

      // ── 4. Check outstanding payments ─────────────────────────────────────────
      if (settings?.require_payment_for_checkin) {
        const debtRow = await db.one<{ total_owed: number }>(
          `SELECT COALESCE(SUM(amount - amount_refunded), 0)::numeric AS total_owed
           FROM   payments
           WHERE  member_id = $1
             AND  gym_id    = $2
             AND  status    IN ('pending', 'failed')`,
          [memberId, gymId]
        )

        const totalOwed   = Number(debtRow?.total_owed ?? 0)
        const graceAmount = Number(settings?.allow_checkin_grace_amount ?? 0)

        if (totalOwed > graceAmount) {
          return deny(
            'PAYMENT_REQUIRED',
            `Outstanding balance of ₦${totalOwed.toLocaleString()} must be cleared before check-in`,
            { amountOwed: totalOwed }
          )
        }
      }

      // ── 5. Check access hours ─────────────────────────────────────────────────
      const location = await db.one<{ open_hours: Record<string, any> | null }>(
        `SELECT open_hours FROM gym_locations WHERE id = $1`,
        [body.locationId]
      )
      if (location?.open_hours) {
        const now     = new Date()
        const dayName = ['sun','mon','tue','wed','thu','fri','sat'][now.getDay()]
        const hours   = location.open_hours[dayName]
        if (hours) {
          const [openH, openM]   = hours.open.split(':').map(Number)
          const [closeH, closeM] = hours.close.split(':').map(Number)
          const currentMins      = now.getHours() * 60 + now.getMinutes()
          const openMins         = openH * 60 + openM
          const closeMins        = closeH * 60 + closeM
          if (currentMins < openMins || currentMins > closeMins) {
            return deny('OUTSIDE_HOURS', 'Gym is currently closed')
          }
        }
      }

      // ── 6. Log the check-in ───────────────────────────────────────────────────
      const checkin = await db.one<{ id: string }>(`
        INSERT INTO check_ins
          (gym_id, member_id, location_id, device_id,
           booking_id, method, result, checked_in_at)
        VALUES ($1,$2,$3,$4,$5,$6,'granted',NOW())
        RETURNING id
      `, [
        gymId, memberId, body.locationId,
        (req.auth as any).deviceId ?? null,
        body.bookingId ?? null,
        body.method,
      ])

      // ── 7. Mark booking as attended ──────────────────────────────────────────
      if (body.bookingId) {
        await db.query(
          `UPDATE bookings SET status = 'attended', checked_in_at = NOW()
           WHERE id = $1 AND member_id = $2`,
          [body.bookingId, memberId]
        )
      }

      logger.info('Check-in granted', { gymId, memberId, method: body.method })

      return {
        granted:   true,
        checkinId: checkin!.id,
        member: {
          id:        memberId,
          firstName: member.first_name,
          lastName:  member.last_name,
        },
      }
    })

    created(res, result)
  }
)

// =============================================================================
// POST /checkins/checkout
// =============================================================================

checkinsRouter.post('/checkout',
  authenticate, resolveTenant,
  async (req: Request, res: Response) => {
    const body  = CheckOutSchema.parse(req.body)
    const gymId = req.gymId

    const checkin = await tenantQuery(gymId,
      `SELECT id FROM check_ins
       WHERE  member_id   = $1
         AND  location_id = $2
         AND  checked_out_at IS NULL
         AND  result = 'granted'
       ORDER  BY checked_in_at DESC LIMIT 1`,
      [body.memberId, body.locationId]
    )

    if (!checkin.rows[0]) throw new NotFoundError('Open check-in for this member')

    await tenantQuery(gymId,
      `UPDATE check_ins SET checked_out_at = NOW() WHERE id = $1`,
      [checkin.rows[0].id]
    )

    ok(res, { message: 'Check-out recorded' })
  }
)

// =============================================================================
// GET /checkins
// =============================================================================

checkinsRouter.get('/',
  authenticate, resolveTenant, can('checkins:read'),
  async (req: Request, res: Response) => {
    const { gymId }               = req
    const { page, limit, offset } = paginate(req)

    const memberId   = req.query.memberId   as string | undefined
    const locationId = req.query.locationId as string | undefined
    const from       = req.query.from       as string | undefined
    const to         = req.query.to         as string | undefined

    const conditions: string[] = ['ci.gym_id = $1']
    const params: unknown[]    = [gymId]
    let p = 2

    if (memberId)   { conditions.push(`ci.member_id   = $${p++}`); params.push(memberId)   }
    if (locationId) { conditions.push(`ci.location_id = $${p++}`); params.push(locationId) }
    if (from)       { conditions.push(`ci.checked_in_at >= $${p++}`); params.push(from)    }
    if (to)         { conditions.push(`ci.checked_in_at <= $${p++}`); params.push(to)      }

    const where = conditions.join(' AND ')

    const [rows, countRow] = await Promise.all([
      tenantQuery(gymId, `
        SELECT
          ci.id, ci.method, ci.result, ci.checked_in_at, ci.checked_out_at,
          m.first_name, m.last_name, m.photo_url,
          gl.name AS location_name
        FROM   check_ins     ci
        JOIN   members       m  ON m.id  = ci.member_id
        JOIN   gym_locations gl ON gl.id = ci.location_id
        WHERE  ${where}
        ORDER  BY ci.checked_in_at DESC
        LIMIT  $${p} OFFSET $${p + 1}
      `, [...params, limit, offset]),

      tenantQuery<{ count: string }>(gymId,
        `SELECT COUNT(*) FROM check_ins ci WHERE ${where}`, params
      ),
    ])

    paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
  }
)

// =============================================================================
// GET /checkins/live  — SSE stream
// =============================================================================

checkinsRouter.get('/live',
  authenticate, resolveTenant, can('checkins:read'),
  async (req: Request, res: Response) => {
    const gymId      = req.gymId
    const locationId = req.query.locationId as string | undefined

    res.setHeader('Content-Type',  'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection',    'keep-alive')
    res.flushHeaders()

    const sendSnapshot = async () => {
      const conditions = ['ci.gym_id = $1', 'ci.checked_out_at IS NULL', "ci.result = 'granted'"]
      const params: unknown[] = [gymId]
      if (locationId) { conditions.push(`ci.location_id = $2`); params.push(locationId) }

      const rows = await tenantQuery(gymId, `
        SELECT
          m.id, m.first_name, m.last_name, m.photo_url,
          ci.checked_in_at, ci.method, gl.name AS location_name
        FROM   check_ins     ci
        JOIN   members       m  ON m.id  = ci.member_id
        JOIN   gym_locations gl ON gl.id = ci.location_id
        WHERE  ${conditions.join(' AND ')}
        ORDER  BY ci.checked_in_at DESC
      `, params)

      res.write(`data: ${JSON.stringify({ members: rows.rows, count: rows.rows.length })}\n\n`)
    }

    await sendSnapshot()
    const interval = setInterval(sendSnapshot, 15_000)
    req.on('close', () => { clearInterval(interval); res.end() })
  }
)

// =============================================================================
// GET /checkins/today
// =============================================================================

checkinsRouter.get('/today',
  authenticate, resolveTenant, can('checkins:read'),
  async (req: Request, res: Response) => {
    const { gymId } = req

    const row = await tenantQuery(gymId, `
      SELECT
        COUNT(*)::int                                         AS total_today,
        COUNT(DISTINCT member_id)::int                        AS unique_members,
        COUNT(*) FILTER (WHERE checked_out_at IS NULL)::int   AS currently_inside,
        MAX(checked_in_at)                                    AS last_checkin_at
      FROM check_ins
      WHERE gym_id = $1
        AND checked_in_at >= CURRENT_DATE
        AND result = 'granted'
    `, [gymId])

    ok(res, row.rows[0])
  }
)

// =============================================================================
// Helpers
// =============================================================================

function deny(code: string, message: string, extra: Record<string, any> = {}) {
  return { granted: false, code, message, ...extra }
}

function decodeQrCode(qrCode: string): string | null {
  try {
    const decoded = Buffer.from(qrCode, 'base64').toString('utf8')
    const payload = JSON.parse(decoded)
    return payload.memberId ?? null
  } catch {
    return null
  }
}
