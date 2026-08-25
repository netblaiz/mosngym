import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction } from '@/db/pool'
import { authenticate, resolveTenant, can, paginate } from '@/middleware'
import { ok, created, noContent, paginated, NotFoundError, ConflictError } from '@/utils/errors'
import { automationQueue } from '@/jobs/queues'
import { logger } from '@/utils/logger'

export const leadsRouter = Router()

leadsRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateLeadSchema = z.object({
  firstName:       z.string().min(1),
  lastName:        z.string().optional(),
  email:           z.string().email().optional(),
  phone:           z.string().optional(),
  source:          z.enum(['website', 'walk_in', 'referral', 'social', 'widget', 'import', 'other']).default('other'),
  notes:           z.string().optional(),
  assignedToId:    z.string().uuid().optional(),
  interestedPlanId: z.string().uuid().optional(),
})

const UpdateLeadSchema = CreateLeadSchema.partial()

const StageSchema = z.object({
  stage:  z.enum(['new', 'contacted', 'trial_booked', 'trial_done', 'converted', 'lost']),
  reason: z.string().optional(), // required when stage = 'lost'
})

const ConvertSchema = z.object({
  planId:              z.string().uuid().optional(),
  stripePaymentMethodId: z.string().optional(),
})

const TrialSchema = z.object({
  expiresAt: z.string().datetime(),
})

// =============================================================================
// GET /leads
// =============================================================================

leadsRouter.get('/', can('leads:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const { page, limit, offset } = paginate(req)

  const stage      = req.query.stage      as string | undefined
  const assignedTo = req.query.assignedTo as string | undefined
  const source     = req.query.source     as string | undefined
  const search     = req.query.search     as string | undefined

  const conditions: string[] = ['l.gym_id = $1']
  const params: unknown[]    = [gymId]
  let p = 2

  if (stage)      { conditions.push(`l.stage = $${p++}`);         params.push(stage) }
  if (assignedTo) { conditions.push(`l.assigned_to_id = $${p++}`); params.push(assignedTo) }
  if (source)     { conditions.push(`l.source = $${p++}`);        params.push(source) }
  if (search) {
    conditions.push(`(l.first_name ILIKE $${p} OR l.last_name ILIKE $${p} OR l.email ILIKE $${p})`)
    params.push(`%${search}%`)
    p++
  }

  const where = conditions.join(' AND ')

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        l.*,
        mp.name                                        AS interested_plan_name,
        s_user.email                                   AS assigned_to_email,
        CONCAT(s_first.first_name, ' ', s_first.last_name) AS assigned_to_name
      FROM   leads l
      LEFT   JOIN membership_plans mp ON mp.id = l.interested_plan_id
      LEFT   JOIN staff             st ON st.id = l.assigned_to_id
      LEFT   JOIN users          s_user ON s_user.id = st.user_id
      LEFT   JOIN LATERAL (
        SELECT first_name, last_name FROM members WHERE gym_id = $1 LIMIT 1
      ) s_first ON TRUE
      WHERE  ${where}
      ORDER  BY l.created_at DESC
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM leads l WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// GET /leads/pipeline  — grouped by stage for kanban view
// =============================================================================

leadsRouter.get('/pipeline', can('leads:read'), async (req: Request, res: Response) => {
  const { gymId } = req

  const rows = await tenantQuery(gymId, `
    SELECT
      stage,
      COUNT(*)::int                AS count,
      json_agg(
        json_build_object(
          'id',         l.id,
          'firstName',  l.first_name,
          'lastName',   l.last_name,
          'email',      l.email,
          'phone',      l.phone,
          'source',     l.source,
          'createdAt',  l.created_at
        ) ORDER BY l.created_at DESC
      ) AS leads
    FROM   leads l
    WHERE  gym_id = $1 AND stage NOT IN ('converted','lost')
    GROUP  BY stage
    ORDER  BY
      CASE stage
        WHEN 'new'          THEN 1
        WHEN 'contacted'    THEN 2
        WHEN 'trial_booked' THEN 3
        WHEN 'trial_done'   THEN 4
      END
  `, [gymId])

  ok(res, rows.rows)
})

// =============================================================================
// POST /leads  — also accessible publicly via widget (no auth)
// =============================================================================

leadsRouter.post('/', async (req: Request, res: Response) => {
  const body  = CreateLeadSchema.parse(req.body)
  const gymId = req.gymId  // set by authenticate middleware if present

  const row = await tenantQuery(gymId, `
    INSERT INTO leads
      (gym_id, first_name, last_name, email, phone,
       source, notes, assigned_to_id, interested_plan_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
  `, [
    gymId, body.firstName, body.lastName ?? null,
    body.email ?? null, body.phone ?? null,
    body.source, body.notes ?? null,
    body.assignedToId ?? null, body.interestedPlanId ?? null,
  ])

  // Trigger lead.created automation
  await automationQueue.add('automation.trigger', {
    gymId,
    event:      'lead.created',
    resourceId: row.rows[0].id,
    payload:    { leadId: row.rows[0].id, source: body.source },
  })

  logger.info('Lead created', { gymId, source: body.source })

  created(res, row.rows[0])
})

// =============================================================================
// GET /leads/:id
// =============================================================================

leadsRouter.get('/:id', can('leads:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT l.*, mp.name AS interested_plan_name
    FROM   leads l
    LEFT   JOIN membership_plans mp ON mp.id = l.interested_plan_id
    WHERE  l.id = $1 AND l.gym_id = $2
  `, [req.params.id, req.gymId])

  if (!row.rows[0]) throw new NotFoundError('Lead', req.params.id)
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /leads/:id
// =============================================================================

leadsRouter.patch('/:id', can('leads:edit'), async (req: Request, res: Response) => {
  const body   = UpdateLeadSchema.parse(req.body)
  const gymId  = req.gymId
  const leadId = req.params.id

  const fieldMap: Record<string, unknown> = {
    first_name:         body.firstName,
    last_name:          body.lastName,
    email:              body.email,
    phone:              body.phone,
    source:             body.source,
    notes:              body.notes,
    assigned_to_id:     body.assignedToId,
    interested_plan_id: body.interestedPlanId,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  const row = await tenantQuery(gymId,
    `UPDATE leads SET ${set}, updated_at = NOW()
     WHERE id = $${values.length + 1} AND gym_id = $${values.length + 2}
     RETURNING *`,
    [...values, leadId, gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Lead', leadId)
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /leads/:id/stage  — move through pipeline
// =============================================================================

leadsRouter.patch('/:id/stage', can('leads:edit'), async (req: Request, res: Response) => {
  const body   = StageSchema.parse(req.body)
  const gymId  = req.gymId
  const leadId = req.params.id

  await tenantQuery(gymId, `
    UPDATE leads
    SET    stage      = $1,
           lost_at    = CASE WHEN $1 = 'lost' THEN NOW() ELSE NULL END,
           lost_reason = $2,
           updated_at = NOW()
    WHERE  id = $3 AND gym_id = $4
  `, [body.stage, body.reason ?? null, leadId, gymId])

  // Trigger automation for trial booked
  if (body.stage === 'trial_booked') {
    await automationQueue.add('automation.trigger', {
      gymId,
      event:      'lead.trial_booked',
      resourceId: leadId,
      payload:    { leadId },
    })
  }

  ok(res, { message: `Stage updated to ${body.stage}` })
})

// =============================================================================
// POST /leads/:id/trial  — issue a trial pass
// =============================================================================

leadsRouter.post('/:id/trial', can('leads:edit'), async (req: Request, res: Response) => {
  const body   = TrialSchema.parse(req.body)
  const gymId  = req.gymId
  const leadId = req.params.id

  await tenantQuery(gymId, `
    UPDATE leads
    SET    trial_pass_issued_at = NOW(),
           trial_expires_at    = $1,
           stage               = 'trial_booked',
           updated_at          = NOW()
    WHERE  id = $2 AND gym_id = $3
  `, [body.expiresAt, leadId, gymId])

  ok(res, { message: 'Trial pass issued' })
})

// =============================================================================
// POST /leads/:id/convert  — convert lead to full member
// =============================================================================

leadsRouter.post('/:id/convert', can('leads:convert'), async (req: Request, res: Response) => {
  const body   = ConvertSchema.parse(req.body)
  const gymId  = req.gymId
  const leadId = req.params.id

  const result = await withTransaction(gymId, async (db) => {

    const lead = await db.one<{
      id: string; first_name: string; last_name: string | null;
      email: string | null; phone: string | null; converted_member_id: string | null
    }>(
      `SELECT id, first_name, last_name, email, phone, converted_member_id
       FROM leads WHERE id = $1 FOR UPDATE`,
      [leadId]
    )
    if (!lead) throw new NotFoundError('Lead', leadId)
    if (lead.converted_member_id) {
      throw new ConflictError('Lead has already been converted')
    }
    if (!lead.email) {
      throw new ConflictError('Lead must have an email address before converting')
    }

    // Create member record
    const member = await db.one<{ id: string }>(`
      INSERT INTO members (gym_id, email, first_name, last_name, phone, status)
      VALUES ($1,$2,$3,$4,$5,'active')
      ON CONFLICT (gym_id, email) DO UPDATE
        SET status = 'active', updated_at = NOW()
      RETURNING id
    `, [gymId, lead.email, lead.first_name, lead.last_name ?? '', lead.phone])

    // Mark lead as converted
    await db.query(`
      UPDATE leads
      SET    stage               = 'converted',
             converted_at        = NOW(),
             converted_member_id = $1
      WHERE  id = $2
    `, [member!.id, leadId])

    return { memberId: member!.id }
  })

  // Trigger member.created automation for the welcome email
  await automationQueue.add('automation.trigger', {
    gymId,
    event:      'member.created',
    resourceId: result.memberId,
    payload:    { memberId: result.memberId, source: 'lead_conversion' },
  })

  logger.info('Lead converted to member', { gymId, leadId, memberId: result.memberId })

  ok(res, { memberId: result.memberId, message: 'Lead converted to member' })
})

// =============================================================================
// DELETE /leads/:id
// =============================================================================

leadsRouter.delete('/:id', can('leads:delete'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId,
    `DELETE FROM leads WHERE id = $1 AND gym_id = $2 RETURNING id`,
    [req.params.id, req.gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Lead', req.params.id)
  noContent(res)
})