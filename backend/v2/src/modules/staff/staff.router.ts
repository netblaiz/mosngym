import { Router, Request, Response } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { v4 as uuid } from 'uuid'
import { tenantQuery, withTransaction, query } from '@/db/pool'
import { key, cacheDel, cacheAside, TTL } from '@/db/redis'
import { authenticate, resolveTenant, can, isOwner, paginate } from '@/middleware'
import { ok, created, noContent, paginated, NotFoundError, ConflictError, ValidationError } from '@/utils/errors'
import { env } from '@/config/env'
import { logger } from '@/utils/logger'

export const staffRouter = Router()

staffRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const InviteStaffSchema = z.object({
  email:          z.string().email(),
  firstName:      z.string().min(1),
  lastName:       z.string().min(1),
  role:           z.enum(['manager', 'trainer', 'front_desk', 'instructor']),
  roleTemplateIds: z.array(z.string().uuid()).optional(),
})

const UpdateStaffSchema = z.object({
  role:           z.enum(['manager', 'trainer', 'front_desk', 'instructor']).optional(),
  bio:            z.string().optional(),
  certifications: z.array(z.string()).optional(),
  hourlyRate:     z.number().positive().optional(),
})

const AssignRolesSchema = z.object({
  roleTemplateIds: z.array(z.string().uuid()),
})

const SetOverrideSchema = z.object({
  permissionKey: z.string().min(1),
  effect:        z.enum(['grant', 'revoke']),
  reason:        z.string().optional(),
})

const RemoveOverrideSchema = z.object({
  permissionKey: z.string().min(1),
})

// =============================================================================
// GET /staff
// =============================================================================

staffRouter.get('/', can('staff:read'), async (req: Request, res: Response) => {
  const { gymId }               = req
  const { page, limit, offset } = paginate(req)

  const role   = req.query.role   as string | undefined
  const active = req.query.active as string | undefined

  const conditions: string[] = ['s.gym_id = $1']
  const params: unknown[]    = [gymId]
  let p = 2

  if (role)   { conditions.push(`s.role = $${p++}`);      params.push(role) }
  if (active) { conditions.push(`s.is_active = $${p++}`); params.push(active === 'true') }

  const where = conditions.join(' AND ')

  const [rows, countRow] = await Promise.all([
    tenantQuery(gymId, `
      SELECT
        s.id, s.role, s.bio, s.certifications, s.is_active,
        s.invited_at, s.accepted_at,
        u.email, u.last_login_at,
        -- assigned role template names
        COALESCE(
          json_agg(
            json_build_object('id', rt.id, 'name', rt.name, 'color', rt.color)
          ) FILTER (WHERE rt.id IS NOT NULL),
          '[]'
        ) AS role_templates
      FROM   staff s
      JOIN   users u ON u.id = s.user_id
      LEFT   JOIN staff_role_assignments sra ON sra.staff_id = s.id
      LEFT   JOIN role_templates         rt  ON rt.id = sra.role_template_id
      WHERE  ${where}
      GROUP  BY s.id, u.email, u.last_login_at
      ORDER  BY s.invited_at DESC
      LIMIT  $${p} OFFSET $${p + 1}
    `, [...params, limit, offset]),

    tenantQuery<{ count: string }>(gymId,
      `SELECT COUNT(*) FROM staff s WHERE ${where}`, params
    ),
  ])

  paginated(res, rows.rows, parseInt(countRow.rows[0].count), page, limit)
})

// =============================================================================
// POST /staff  — invite a new staff member
// Creates a user account (or finds existing), sends invite email
// =============================================================================

staffRouter.post('/', can('staff:invite'), async (req: Request, res: Response) => {
  const body  = InviteStaffSchema.parse(req.body)
  const gymId = req.gymId

  const staffMember = await withTransaction(gymId, async (db) => {

    // Check not already a staff member of this gym
    const existing = await query<{ id: string }>(
      `SELECT s.id FROM staff s
       JOIN   users u ON u.id = s.user_id
       WHERE  u.email = $1 AND s.gym_id = $2`,
      [body.email, gymId]
    )
    if (existing.rows[0]) {
      throw new ConflictError('This email is already a staff member of this gym')
    }

    // Find or create user account
    let userId: string
    const existingUser = await query<{ id: string }>(
      `SELECT id FROM users WHERE email = $1`, [body.email]
    )

    if (existingUser.rows[0]) {
      userId = existingUser.rows[0].id
    } else {
      // Create account with a temporary password they'll reset via invite link
      const tempPassword = uuid()
      const hash         = await bcrypt.hash(tempPassword, env.BCRYPT_ROUNDS)
      const newUser      = await query<{ id: string }>(
        `INSERT INTO users (email, password_hash, email_verified)
         VALUES ($1, $2, FALSE) RETURNING id`,
        [body.email, hash]
      )
      userId = newUser.rows[0].id
    }

    // Create staff record
    const staff = await db.one<{ id: string }>(
      `INSERT INTO staff (gym_id, user_id, role, is_active)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [gymId, userId, body.role]
    )

    // Assign role templates if provided
    if (body.roleTemplateIds?.length) {
      for (const templateId of body.roleTemplateIds) {
        await db.query(
          `INSERT INTO staff_role_assignments (gym_id, staff_id, role_template_id, assigned_by_id)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [gymId, staff!.id, templateId, req.staffId]
        )
      }
    }

    // TODO: enqueue invite email job with sign-in link

    logger.info('Staff member invited', { gymId, email: body.email, role: body.role })

    return staff!
  })

  const full = await tenantQuery(gymId,
    `SELECT s.*, u.email FROM staff s JOIN users u ON u.id = s.user_id WHERE s.id = $1`,
    [staffMember.id]
  )

  created(res, full.rows[0])
})

// =============================================================================
// GET /staff/:id
// =============================================================================

staffRouter.get('/:id', can('staff:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId, `
    SELECT
      s.*,
      u.email, u.last_login_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id',    rt.id,
            'name',  rt.name,
            'color', rt.color,
            'icon',  rt.icon
          )
        ) FILTER (WHERE rt.id IS NOT NULL),
        '[]'
      ) AS role_templates
    FROM   staff s
    JOIN   users u ON u.id = s.user_id
    LEFT   JOIN staff_role_assignments sra ON sra.staff_id = s.id
    LEFT   JOIN role_templates         rt  ON rt.id = sra.role_template_id
    WHERE  s.id = $1 AND s.gym_id = $2
    GROUP  BY s.id, u.email, u.last_login_at
  `, [req.params.id, req.gymId])

  if (!row.rows[0]) throw new NotFoundError('Staff member', req.params.id)
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /staff/:id
// =============================================================================

staffRouter.patch('/:id', can('staff:edit'), async (req: Request, res: Response) => {
  const body     = UpdateStaffSchema.parse(req.body)
  const { gymId } = req
  const staffId  = req.params.id

  const fieldMap: Record<string, unknown> = {
    role:           body.role,
    bio:            body.bio,
    certifications: body.certifications,
    hourly_rate:    body.hourlyRate,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  const row = await tenantQuery(gymId,
    `UPDATE staff SET ${set}, updated_at = NOW()
     WHERE id = $${values.length + 1} AND gym_id = $${values.length + 2}
     RETURNING *`,
    [...values, staffId, gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Staff member', staffId)

  // If role changed, bust cached role
  if (body.role) await cacheDel(key(gymId, 'staff:role', staffId))

  ok(res, row.rows[0])
})

// =============================================================================
// POST /staff/:id/deactivate
// =============================================================================

staffRouter.post('/:id/deactivate', can('staff:deactivate'), async (req: Request, res: Response) => {
  const { gymId } = req
  const staffId   = req.params.id

  // Cannot deactivate yourself
  if (staffId === req.staffId) {
    throw new ValidationError('You cannot deactivate your own account')
  }

  // Cannot deactivate the gym owner
  const target = await tenantQuery(gymId,
    `SELECT role FROM staff WHERE id = $1`, [staffId]
  )
  if (target.rows[0]?.role === 'owner') {
    throw new ValidationError('Cannot deactivate the gym owner')
  }

  await tenantQuery(gymId,
    `UPDATE staff SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND gym_id = $2`,
    [staffId, gymId]
  )

  // Bust all cached permissions for this staff member
  await cacheDel(key(gymId, 'perms',      staffId))
  await cacheDel(key(gymId, 'staff:role', staffId))

  ok(res, { message: 'Staff member deactivated' })
})

// =============================================================================
// POST /staff/:id/reactivate
// =============================================================================

staffRouter.post('/:id/reactivate', can('staff:deactivate'), async (req: Request, res: Response) => {
  await tenantQuery(req.gymId,
    `UPDATE staff SET is_active = TRUE, updated_at = NOW() WHERE id = $1 AND gym_id = $2`,
    [req.params.id, req.gymId]
  )
  ok(res, { message: 'Staff member reactivated' })
})

// =============================================================================
// GET /staff/:id/permissions  — effective permission set + overrides
// =============================================================================

staffRouter.get('/:id/permissions', can('staff:permissions'), async (req: Request, res: Response) => {
  const { gymId } = req
  const staffId   = req.params.id

  const [effective, overrides, roleTemplates] = await Promise.all([
    // Effective permissions from get_staff_permissions() function (migration 012)
    tenantQuery(gymId,
      `SELECT permission_key, source FROM get_staff_permissions($1, $2)`,
      [gymId, staffId]
    ),
    // Raw overrides
    tenantQuery(gymId,
      `SELECT permission_key, effect, reason, created_at
       FROM staff_permission_overrides
       WHERE staff_id = $1`,
      [staffId]
    ),
    // Assigned role templates
    tenantQuery(gymId, `
      SELECT rt.id, rt.name, rt.color, rt.icon
      FROM   staff_role_assignments sra
      JOIN   role_templates rt ON rt.id = sra.role_template_id
      WHERE  sra.staff_id = $1
    `, [staffId]),
  ])

  ok(res, {
    effectivePermissions: effective.rows.map(r => r.permission_key),
    overrides:            overrides.rows,
    roleTemplates:        roleTemplates.rows,
  })
})

// =============================================================================
// PUT /staff/:id/roles  — replace all role template assignments
// =============================================================================

staffRouter.put('/:id/roles', can('staff:permissions'), async (req: Request, res: Response) => {
  const body    = AssignRolesSchema.parse(req.body)
  const { gymId } = req
  const staffId = req.params.id

  await withTransaction(gymId, async (db) => {
    // Delete existing assignments
    await db.query(
      `DELETE FROM staff_role_assignments WHERE staff_id = $1 AND gym_id = $2`,
      [staffId, gymId]
    )
    // Insert new ones
    for (const templateId of body.roleTemplateIds) {
      await db.query(
        `INSERT INTO staff_role_assignments (gym_id, staff_id, role_template_id, assigned_by_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [gymId, staffId, templateId, req.staffId]
      )
    }
  })

  // Bust permission cache — role change takes effect immediately
  await cacheDel(key(gymId, 'perms', staffId))

  ok(res, { message: 'Roles updated' })
})

// =============================================================================
// POST /staff/:id/overrides  — set a permission override (grant or revoke)
// =============================================================================

staffRouter.post('/:id/overrides', can('staff:permissions'), async (req: Request, res: Response) => {
  const body    = SetOverrideSchema.parse(req.body)
  const { gymId } = req
  const staffId = req.params.id

  await tenantQuery(gymId, `
    INSERT INTO staff_permission_overrides
      (gym_id, staff_id, permission_key, effect, reason, set_by_id)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (gym_id, staff_id, permission_key)
    DO UPDATE SET effect = $4, reason = $5, set_by_id = $6, updated_at = NOW()
  `, [gymId, staffId, body.permissionKey, body.effect, body.reason ?? null, req.staffId])

  // Bust permission cache
  await cacheDel(key(gymId, 'perms', staffId))

  ok(res, { message: `Permission ${body.effect} set for ${body.permissionKey}` })
})

// =============================================================================
// DELETE /staff/:id/overrides  — remove a permission override (back to role default)
// =============================================================================

staffRouter.delete('/:id/overrides', can('staff:permissions'), async (req: Request, res: Response) => {
  const body    = RemoveOverrideSchema.parse(req.body)
  const { gymId } = req
  const staffId = req.params.id

  await tenantQuery(gymId,
    `DELETE FROM staff_permission_overrides
     WHERE gym_id = $1 AND staff_id = $2 AND permission_key = $3`,
    [gymId, staffId, body.permissionKey]
  )

  await cacheDel(key(gymId, 'perms', staffId))

  ok(res, { message: `Override removed for ${body.permissionKey}` })
})

// =============================================================================
// GET /staff/me  — authenticated staff member views their own record
// =============================================================================

staffRouter.get('/me', async (req: Request, res: Response) => {
  if (!req.staffId) throw new NotFoundError('Staff profile')

  const row = await tenantQuery(req.gymId, `
    SELECT s.*, u.email,
      COALESCE(
        json_agg(json_build_object('id', rt.id, 'name', rt.name)) FILTER (WHERE rt.id IS NOT NULL),
        '[]'
      ) AS role_templates
    FROM   staff s
    JOIN   users u ON u.id = s.user_id
    LEFT   JOIN staff_role_assignments sra ON sra.staff_id = s.id
    LEFT   JOIN role_templates rt ON rt.id = sra.role_template_id
    WHERE  s.id = $1
    GROUP  BY s.id, u.email
  `, [req.staffId])

  if (!row.rows[0]) throw new NotFoundError('Staff profile')
  ok(res, row.rows[0])
})