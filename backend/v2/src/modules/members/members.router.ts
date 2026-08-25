import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import { key, cacheDel } from '@/db/redis'
import { authenticate, resolveTenant, can, selfOr, paginate } from '@/middleware'
import { ok, created, paginated, noContent, NotFoundError, ConflictError } from '@/utils/errors'

export const membersRouter = Router()

membersRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateMemberSchema = z.object({
  email:       z.string().email(),
  firstName:   z.string().min(1),
  lastName:    z.string().min(1),
  phone:       z.string().optional(),
  dateOfBirth: z.string().date().optional(),
  gender:      z.enum(['male', 'female', 'non_binary', 'prefer_not_to_say']).optional(),
  healthNotes: z.string().optional(),
  emergencyContact: z.object({
    name:         z.string(),
    phone:        z.string(),
    relationship: z.string(),
  }).optional(),
  referredById: z.string().uuid().optional(),
})

const UpdateMemberSchema = CreateMemberSchema.partial()

const ListQuerySchema = z.object({
  search:    z.string().optional(),
  status:    z.enum(['active', 'inactive', 'frozen', 'banned']).optional(),
  planId:    z.string().uuid().optional(),
  sortBy:    z.enum(['joined_at', 'first_name', 'last_name', 'email']).default('joined_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

// =============================================================================
// GET /members
// =============================================================================

membersRouter.get('/', can('members:read'), async (req: Request, res: Response) => {
  const gymId               = req.gymId
  const { page, limit, offset } = paginate(req)
  const q                   = ListQuerySchema.parse(req.query)

  const conditions: string[] = ['m.gym_id = $1', 'm.deleted_at IS NULL']
  const params: unknown[]    = [gymId]
  let   p                    = 2

  if (q.status) { conditions.push(`m.status = $${p++}`); params.push(q.status) }

  if (q.search) {
    conditions.push(`(
      m.first_name ILIKE $${p}
      OR m.last_name  ILIKE $${p}
      OR m.email      ILIKE $${p}
      OR (m.first_name || ' ' || m.last_name) ILIKE $${p}
    )`)
    params.push(`%${q.search}%`)
    p++
  }

  if (q.planId) {
    conditions.push(`EXISTS (
      SELECT 1 FROM member_subscriptions ms
      WHERE ms.member_id = m.id AND ms.plan_id = $${p++} AND ms.status = 'active'
    )`)
    params.push(q.planId)
  }

  const where   = conditions.join(' AND ')
  const orderBy = `m.${q.sortBy} ${q.sortOrder.toUpperCase()}`

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        m.id, m.email, m.first_name, m.last_name,
        m.phone, m.status, m.photo_url, m.joined_at,
        CASE WHEN ms.id IS NOT NULL THEN
          json_build_object(
            'id',       ms.id,
            'planName', mp.name,
            'status',   ms.status,
            'endDate',  ms.end_date,
            'credits',  ms.credits_remaining
          )
        END AS subscription,
        (
          SELECT checked_in_at FROM check_ins ci
          WHERE  ci.member_id = m.id
          ORDER  BY ci.checked_in_at DESC LIMIT 1
        ) AS last_seen_at
      FROM   members m
      LEFT   JOIN member_subscriptions ms ON ms.member_id = m.id AND ms.status = 'active'
      LEFT   JOIN membership_plans mp ON mp.id = ms.plan_id
      WHERE  ${where}
      ORDER  BY ${orderBy}
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM members m WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// POST /members
// =============================================================================

membersRouter.post('/', can('members:create'), async (req: Request, res: Response) => {
  const body  = CreateMemberSchema.parse(req.body)
  const gymId = req.gymId

  const member = await withTransaction(gymId, async (db) => {
    const existing = await db.one(
      `SELECT id FROM members WHERE gym_id = $1 AND email = $2`,
      [gymId, body.email]
    )
    if (existing) throw new ConflictError(`A member with email ${body.email} already exists`)

    return db.one<{ id: string }>(`
      INSERT INTO members
        (gym_id, email, first_name, last_name, phone,
         date_of_birth, gender, health_notes,
         emergency_contact, referred_by_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id
    `, [
      gymId, body.email, body.firstName, body.lastName,
      body.phone ?? null, body.dateOfBirth ?? null, body.gender ?? null,
      body.healthNotes ?? null,
      body.emergencyContact ? JSON.stringify(body.emergencyContact) : null,
      body.referredById ?? null,
    ])
  })

  const full = await tenantQuery(gymId, `SELECT * FROM members WHERE id = $1`, [member!.id])
  created(res, full.rows[0])
})

// =============================================================================
// GET /members/me
// =============================================================================

membersRouter.get('/me',
  selfOr(() => 'me', 'members:read'),
  async (req: Request, res: Response) => {
    const memberId = req.memberId
    if (!memberId) throw new NotFoundError('Member')

    const row = await tenantQuery(req.gymId, `
      SELECT
        m.*,
        CASE WHEN ms.id IS NOT NULL THEN
          json_build_object(
            'id',        ms.id,
            'planName',  mp.name,
            'status',    ms.status,
            'startDate', ms.start_date,
            'endDate',   ms.end_date,
            'credits',   ms.credits_remaining,
            'autoRenew', ms.auto_renew
          )
        END AS subscription
      FROM   members m
      LEFT   JOIN member_subscriptions ms ON ms.member_id = m.id AND ms.status = 'active'
      LEFT   JOIN membership_plans mp ON mp.id = ms.plan_id
      WHERE  m.id = $1
    `, [memberId])

    if (!row.rows[0]) throw new NotFoundError('Member')
    ok(res, row.rows[0])
  }
)

// =============================================================================
// GET /members/:id
// =============================================================================

membersRouter.get('/:id', can('members:read'), async (req: Request, res: Response) => {
  const { gymId } = req
  const memberId  = req.params.id

  const row = await tenantQuery(gymId, `
    SELECT
      m.*,
      CASE WHEN ms.id IS NOT NULL THEN
        json_build_object(
          'id',        ms.id,
          'planId',    ms.plan_id,
          'planName',  mp.name,
          'status',    ms.status,
          'startDate', ms.start_date,
          'endDate',   ms.end_date,
          'credits',   ms.credits_remaining,
          'autoRenew', ms.auto_renew,
          'frozen',    ms.frozen_from IS NOT NULL
        )
      END AS subscription,
      (SELECT COUNT(*)      FROM check_ins ci WHERE ci.member_id = m.id)::int          AS total_checkins,
      (SELECT COUNT(*)      FROM bookings  b  WHERE b.member_id  = m.id AND b.status = 'attended')::int AS classes_attended,
      (SELECT checked_in_at FROM check_ins ci WHERE ci.member_id = m.id ORDER BY ci.checked_in_at DESC LIMIT 1) AS last_seen_at
    FROM   members m
    LEFT   JOIN member_subscriptions ms ON ms.member_id = m.id AND ms.status = 'active'
    LEFT   JOIN membership_plans mp ON mp.id = ms.plan_id
    WHERE  m.id = $1 AND m.gym_id = $2 AND m.deleted_at IS NULL
  `, [memberId, gymId])

  if (!row.rows[0]) throw new NotFoundError('Member', memberId)
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /members/:id
// =============================================================================

membersRouter.patch('/:id', can('members:edit'), async (req: Request, res: Response) => {
  const body     = UpdateMemberSchema.parse(req.body)
  const { gymId } = req
  const memberId = req.params.id

  const fieldMap: Record<string, unknown> = {
    email:             body.email,
    first_name:        body.firstName,
    last_name:         body.lastName,
    phone:             body.phone,
    date_of_birth:     body.dateOfBirth,
    gender:            body.gender,
    health_notes:      body.healthNotes,
    emergency_contact: body.emergencyContact
      ? JSON.stringify(body.emergencyContact)
      : undefined,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  await tenantQuery(gymId,
    `UPDATE members SET ${set}, updated_at = NOW()
     WHERE id = $${values.length + 1} AND gym_id = $${values.length + 2} AND deleted_at IS NULL`,
    [...values, memberId, gymId]
  )

  const updated = await tenantQuery(gymId, `SELECT * FROM members WHERE id = $1`, [memberId])
  if (!updated.rows[0]) throw new NotFoundError('Member', memberId)
  ok(res, updated.rows[0])
})

// =============================================================================
// PATCH /members/me
// =============================================================================

membersRouter.patch('/me',
  selfOr(() => 'me', 'members:edit'),
  async (req: Request, res: Response) => {
    const memberId = req.memberId
    if (!memberId) throw new NotFoundError('Member')

    const MemberSelfUpdateSchema = z.object({
      phone:       z.string().optional(),
      healthNotes: z.string().optional(),
      emergencyContact: z.object({
        name:         z.string(),
        phone:        z.string(),
        relationship: z.string(),
      }).optional(),
    })

    const body = MemberSelfUpdateSchema.parse(req.body)

    const fieldMap: Record<string, unknown> = {
      phone:             body.phone,
      health_notes:      body.healthNotes,
      emergency_contact: body.emergencyContact
        ? JSON.stringify(body.emergencyContact)
        : undefined,
    }

    const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
    if (!updates.length) { ok(res, { message: 'No changes' }); return }

    const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
    const values = updates.map(([, v]) => v)

    await tenantQuery(req.gymId,
      `UPDATE members SET ${set}, updated_at = NOW() WHERE id = $${values.length + 1}`,
      [...values, memberId]
    )

    const updated = await tenantQuery(req.gymId, `SELECT * FROM members WHERE id = $1`, [memberId])
    ok(res, updated.rows[0])
  }
)

// =============================================================================
// DELETE /members/:id
// =============================================================================

membersRouter.delete('/:id', can('members:delete'), async (req: Request, res: Response) => {
  const { gymId } = req
  const memberId  = req.params.id

  await withTransaction(gymId, async (db) => {
    const member = await db.one(
      `SELECT id FROM members WHERE id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [memberId, gymId]
    )
    if (!member) throw new NotFoundError('Member', memberId)

    await db.query(
      `UPDATE member_subscriptions SET status = 'cancelled', cancelled_at = NOW()
       WHERE member_id = $1 AND status = 'active'`,
      [memberId]
    )

    await db.query(
      `UPDATE members SET deleted_at = NOW(), status = 'inactive' WHERE id = $1 AND gym_id = $2`,
      [memberId, gymId]
    )
  })

  await cacheDel(key(gymId, 'perms', memberId))
  noContent(res)
})

// =============================================================================
// GET /members/:id/checkins
// =============================================================================

membersRouter.get('/:id/checkins', can('checkins:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const memberId                = req.params.id
  const { page, limit, offset } = paginate(req)

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        ci.id, ci.method, ci.result,
        ci.checked_in_at, ci.checked_out_at,
        gl.name AS location_name
      FROM   check_ins ci
      JOIN   gym_locations gl ON gl.id = ci.location_id
      WHERE  ci.member_id = $1
      ORDER  BY ci.checked_in_at DESC
      LIMIT  $2 OFFSET $3
    `, [memberId, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM check_ins WHERE member_id = $1`, [memberId]
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// GET /members/:id/payments
// =============================================================================

membersRouter.get('/:id/payments', can('billing:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const memberId                = req.params.id
  const { page, limit, offset } = paginate(req)

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        p.id, p.type, p.status, p.amount, p.currency,
        p.payment_method, p.failure_reason, p.paid_at, p.created_at,
        mp.name AS plan_name
      FROM   payments p
      LEFT   JOIN member_subscriptions ms ON ms.id = p.subscription_id
      LEFT   JOIN membership_plans     mp ON mp.id = ms.plan_id
      WHERE  p.member_id = $1
      ORDER  BY p.created_at DESC
      LIMIT  $2 OFFSET $3
    `, [memberId, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM payments WHERE member_id = $1`, [memberId]
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})