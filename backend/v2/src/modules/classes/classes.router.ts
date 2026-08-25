import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import { authenticate, resolveTenant, can, paginate } from '@/middleware'
import { ok, created, noContent, paginated, NotFoundError, ValidationError } from '@/utils/errors'

export const classesRouter = Router()

classesRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateTemplateSchema = z.object({
  name:           z.string().min(1),
  description:    z.string().optional(),
  durationMins:   z.number().int().positive(),
  defaultCapacity: z.number().int().positive(),
  color:          z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  category:       z.string().optional(),
  requiresCredits: z.number().int().min(0).default(1),
})

const CreateSessionSchema = z.object({
  templateId:       z.string().uuid(),
  trainerId:        z.string().uuid().optional(),
  locationId:       z.string().uuid(),
  startsAt:         z.string().datetime(),
  capacityOverride: z.number().int().positive().optional(),
  recurrenceRule:   z.string().optional(), // RFC 5545 RRULE string
  notes:            z.string().optional(),
})

const UpdateSessionSchema = z.object({
  trainerId:        z.string().uuid().optional(),
  startsAt:         z.string().datetime().optional(),
  capacityOverride: z.number().int().positive().optional(),
  notes:            z.string().optional(),
})

const CancelSessionSchema = z.object({
  reason:       z.string().optional(),
  cancelSeries: z.boolean().default(false), // cancel all future in recurrence
})

const ListSessionsSchema = z.object({
  from:       z.string().datetime().optional(),
  to:         z.string().datetime().optional(),
  locationId: z.string().uuid().optional(),
  trainerId:  z.string().uuid().optional(),
  status:     z.enum(['scheduled', 'cancelled', 'completed']).optional(),
})

// =============================================================================
// ── TEMPLATES ──
// =============================================================================

// GET /classes/templates
classesRouter.get('/templates', can('classes:read'), async (req: Request, res: Response) => {
  const rows = await tenantQuery(req.gymId,
    `SELECT * FROM class_templates
     WHERE gym_id = $1 AND is_active = TRUE
     ORDER BY name ASC`,
    [req.gymId]
  )
  ok(res, rows.rows)
})

// POST /classes/templates
classesRouter.post('/templates', can('classes:create'), async (req: Request, res: Response) => {
  const body = CreateTemplateSchema.parse(req.body)

  const row = await tenantQuery(req.gymId, `
    INSERT INTO class_templates
      (gym_id, name, description, duration_mins,
       default_capacity, color, category, requires_credits)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
  `, [
    req.gymId, body.name, body.description ?? null,
    body.durationMins, body.defaultCapacity, body.color,
    body.category ?? null, body.requiresCredits,
  ])

  created(res, row.rows[0])
})

// PATCH /classes/templates/:id
classesRouter.patch('/templates/:id', can('classes:edit'), async (req: Request, res: Response) => {
  const body = CreateTemplateSchema.partial().parse(req.body)

  const fieldMap: Record<string, unknown> = {
    name:             body.name,
    description:      body.description,
    duration_mins:    body.durationMins,
    default_capacity: body.defaultCapacity,
    color:            body.color,
    category:         body.category,
    requires_credits: body.requiresCredits,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  const row = await tenantQuery(req.gymId,
    `UPDATE class_templates SET ${set}, updated_at = NOW()
     WHERE id = $${values.length + 1} AND gym_id = $${values.length + 2}
     RETURNING *`,
    [...values, req.params.id, req.gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Class template', req.params.id)
  ok(res, row.rows[0])
})

// =============================================================================
// ── SESSIONS ──
// =============================================================================

// GET /classes/sessions  — timetable query
classesRouter.get('/sessions', can('classes:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const { page, limit, offset } = paginate(req)
  const q = ListSessionsSchema.parse(req.query)

  const conditions: string[] = ['cs.gym_id = $1']
  const params: unknown[]    = [gymId]
  let p = 2

  if (q.from)       { conditions.push(`cs.starts_at >= $${p++}`);    params.push(q.from) }
  if (q.to)         { conditions.push(`cs.starts_at <= $${p++}`);    params.push(q.to) }
  if (q.locationId) { conditions.push(`cs.location_id = $${p++}`);   params.push(q.locationId) }
  if (q.trainerId)  { conditions.push(`cs.trainer_id = $${p++}`);    params.push(q.trainerId) }
  if (q.status)     { conditions.push(`cs.status = $${p++}`);        params.push(q.status) }

  const where = conditions.join(' AND ')

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        cs.*,
        ct.name          AS class_name,
        ct.color,
        ct.duration_mins,
        ct.requires_credits,
        gl.name          AS location_name,
        COUNT(b.id) FILTER (WHERE b.status = 'confirmed')::int AS confirmed_count,
        COUNT(b.id) FILTER (WHERE b.status = 'waitlisted')::int AS waitlisted_count
      FROM   class_sessions cs
      JOIN   class_templates ct ON ct.id = cs.template_id
      JOIN   gym_locations   gl ON gl.id = cs.location_id
      LEFT   JOIN bookings   b  ON b.session_id = cs.id
      WHERE  ${where}
      GROUP  BY cs.id, ct.name, ct.color, ct.duration_mins, ct.requires_credits, gl.name
      ORDER  BY cs.starts_at ASC
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM class_sessions cs WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// POST /classes/sessions
classesRouter.post('/sessions', can('classes:create'), async (req: Request, res: Response) => {
  const body   = CreateSessionSchema.parse(req.body)
  const gymId  = req.gymId
  const startsAt = new Date(body.startsAt)

  // Resolve duration from template to calculate ends_at
  const template = await tenantQuery(gymId,
    `SELECT duration_mins, default_capacity FROM class_templates WHERE id = $1`,
    [body.templateId]
  )
  if (!template.rows[0]) throw new NotFoundError('Class template', body.templateId)

  const { duration_mins, default_capacity } = template.rows[0]
  const endsAt   = new Date(startsAt.getTime() + duration_mins * 60_000)
  const capacity = body.capacityOverride ?? default_capacity

  const row = await tenantQuery(gymId, `
    INSERT INTO class_sessions
      (gym_id, template_id, trainer_id, location_id,
       starts_at, ends_at, capacity, status, recurrence_rule, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'scheduled',$8,$9)
    RETURNING *
  `, [
    gymId, body.templateId, body.trainerId ?? null,
    body.locationId, startsAt, endsAt, capacity,
    body.recurrenceRule ?? null, body.notes ?? null,
  ])

  created(res, row.rows[0])
})

// GET /classes/sessions/:id  — with attendee count and bookings
classesRouter.get('/sessions/:id', can('classes:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT
      cs.*,
      ct.name          AS class_name,
      ct.color,
      ct.duration_mins,
      ct.requires_credits,
      gl.name          AS location_name,
      COUNT(b.id) FILTER (WHERE b.status = 'confirmed')::int  AS confirmed_count,
      COUNT(b.id) FILTER (WHERE b.status = 'waitlisted')::int AS waitlisted_count
    FROM   class_sessions cs
    JOIN   class_templates ct ON ct.id = cs.template_id
    JOIN   gym_locations   gl ON gl.id = cs.location_id
    LEFT   JOIN bookings   b  ON b.session_id = cs.id
    WHERE  cs.id = $1 AND cs.gym_id = $2
    GROUP  BY cs.id, ct.name, ct.color, ct.duration_mins, ct.requires_credits, gl.name
  `, [req.params.id, req.gymId])

  if (!row.rows[0]) throw new NotFoundError('Class session', req.params.id)
  ok(res, row.rows[0])
})

// PATCH /classes/sessions/:id
classesRouter.patch('/sessions/:id', can('classes:edit'), async (req: Request, res: Response) => {
  const body   = UpdateSessionSchema.parse(req.body)
  const gymId  = req.gymId
  const sessId = req.params.id

  const fieldMap: Record<string, unknown> = {
    trainer_id:        body.trainerId,
    starts_at:         body.startsAt ? new Date(body.startsAt) : undefined,
    capacity_override: body.capacityOverride,
    notes:             body.notes,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  const row = await tenantQuery(gymId,
    `UPDATE class_sessions SET ${set}, updated_at = NOW()
     WHERE id = $${values.length + 1} AND gym_id = $${values.length + 2}
     RETURNING *`,
    [...values, sessId, gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Class session', sessId)
  ok(res, row.rows[0])
})

// POST /classes/sessions/:id/cancel
classesRouter.post('/sessions/:id/cancel', can('classes:cancel'), async (req: Request, res: Response) => {
  const body   = CancelSessionSchema.parse(req.body)
  const gymId  = req.gymId
  const sessId = req.params.id

  await withTransaction(gymId, async (db) => {
    const session = await db.one<{
      id: string; status: string; recurrence_parent_id: string | null
    }>(
      `SELECT id, status, recurrence_parent_id
       FROM class_sessions WHERE id = $1 FOR UPDATE`,
      [sessId]
    )
    if (!session) throw new NotFoundError('Class session', sessId)
    if (session.status === 'cancelled') {
      throw new ValidationError('Session is already cancelled')
    }

    // Cancel this session (and optionally the whole series)
    const targetIds = body.cancelSeries && session.recurrence_parent_id
      ? await db.many<{ id: string }>(
          `SELECT id FROM class_sessions
           WHERE  (id = $1 OR recurrence_parent_id = $1)
             AND  starts_at >= NOW()
             AND  status = 'scheduled'`,
          [session.recurrence_parent_id]
        ).then(rows => rows.map(r => r.id))
      : [sessId]

    for (const id of targetIds) {
      await db.query(
        `UPDATE class_sessions
         SET status = 'cancelled', cancellation_reason = $1, cancelled_at = NOW()
         WHERE id = $2`,
        [body.reason ?? null, id]
      )

      // Refund credits to all confirmed bookings for this session
      await db.query(`
        UPDATE member_subscriptions ms
        SET    credits_remaining = credits_remaining + b.credits_used
        FROM   bookings b
        WHERE  b.session_id      = $1
          AND  b.status          = 'confirmed'
          AND  b.subscription_id = ms.id
      `, [id])

      // Cancel all bookings for this session
      await db.query(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW()
         WHERE session_id = $1 AND status IN ('confirmed','waitlisted')`,
        [id]
      )
    }

    // TODO: emit session.cancelled event → notify all attendees
  })

  ok(res, { message: 'Session cancelled' })
})

// GET /classes/sessions/:id/attendees
classesRouter.get('/sessions/:id/attendees', can('bookings:read'), async (req: Request, res: Response) => {
  const rows = await tenantQuery(req.gymId, `
    SELECT
      b.id            AS booking_id,
      b.status,
      b.waitlist_position,
      b.checked_in_at,
      b.booked_at,
      m.id            AS member_id,
      m.first_name,
      m.last_name,
      m.email,
      m.photo_url
    FROM   bookings b
    JOIN   members  m ON m.id = b.member_id
    WHERE  b.session_id = $1
      AND  b.status IN ('confirmed','waitlisted','attended')
    ORDER  BY b.status ASC, b.waitlist_position ASC NULLS FIRST, b.booked_at ASC
  `, [req.params.id])

  ok(res, rows.rows)
})