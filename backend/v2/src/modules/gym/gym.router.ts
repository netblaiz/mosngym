import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { tenantQuery, withTransaction, query } from '@/db/pool'
import { authenticate, resolveTenant, can, isOwner, paginate } from '@/middleware'
import { ok, created, noContent, NotFoundError, ConflictError } from '@/utils/errors'
import { key, cacheDel, cacheBust } from '@/db/redis'

export const gymRouter = Router()

gymRouter.use(authenticate, resolveTenant)

// ─── Schemas ──────────────────────────────────────────────────────────────────

const UpdateGymSchema = z.object({
  name:        z.string().min(1).optional(),
  email:       z.string().email().optional(),
  phone:       z.string().optional(),
  website:     z.string().url().optional(),
  logoUrl:     z.string().url().optional(),
  brandColor:  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  timezone:    z.string().optional(),
  currency:    z.string().length(3).optional(),
  
})

const UpdateSettingsSchema = z.object({
  bookingLeadTimeHrs:  z.number().int().min(0).optional(),
  bookingMaxAdvanceDays: z.number().int().min(1).optional(),
  cancelWindowHrs:     z.number().int().min(0).optional(),
  noShowFee:           z.number().min(0).optional(),
  allowOnlineSignup:   z.boolean().optional(),
  allowGuestBooking:   z.boolean().optional(),
  accessMode:          z.enum(['staffed', '24_7', 'hybrid']).optional(),
  checkinMethod:       z.array(z.enum(['qr', 'ble', 'pin', 'fob'])).optional(),
  memberAppEnabled:    z.boolean().optional(),
  widgetEnabled:       z.boolean().optional(),
  requirePaymentForCheckin: z.boolean().optional(),
  checkinGraceAmount:       z.number().min(0).optional(),
})

const LocationSchema = z.object({
  name:         z.string().min(1),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city:         z.string().optional(),
  state:        z.string().optional(),
  postcode:     z.string().optional(),
  country:      z.string().length(2).optional(),
  phone:        z.string().optional(),
  email:        z.string().email().optional(),
  isPrimary:    z.boolean().default(false),
  openHours:    z.record(z.object({
    open:  z.string(),
    close: z.string(),
  })).optional(),
})

const IntegrationSchema = z.object({
  provider:    z.enum(['stripe', 'paystack', 'flutterwave', 'twilio', 'sendgrid', 'mailchimp', 'zapier']),
  credentials: z.record(z.string()),  // provider-specific keys
  config:      z.record(z.unknown()).optional(),
})

// =============================================================================
// GET /gym  — full gym profile
// =============================================================================

gymRouter.get('/', can('settings:read'), async (req: Request, res: Response) => {
  const row = await query<Record<string, unknown>>(
    `SELECT id, name, slug, email, phone, website,
            logo_url, brand_color, timezone, country,
            currency, subscription_plan, subscription_status,
            trial_ends_at, created_at
     FROM gyms WHERE id = $1`,
    [req.gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Gym')
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /gym  — update gym profile
// =============================================================================

gymRouter.patch('/', can('settings:edit'), async (req: Request, res: Response) => {
  const body  = UpdateGymSchema.parse(req.body)
  const gymId = req.gymId

  const fieldMap: Record<string, unknown> = {
    name:        body.name,
    email:       body.email,
    phone:       body.phone,
    website:     body.website,
    logo_url:    body.logoUrl,
    brand_color: body.brandColor,
    timezone:    body.timezone,
    currency:    body.currency,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  await query(
    `UPDATE gyms SET ${set}, updated_at = NOW() WHERE id = $${values.length + 1}`,
    [...values, gymId]
  )

  // Bust gym status cache
  await cacheDel(key(gymId, 'gym:status'))

  const updated = await query(`SELECT * FROM gyms WHERE id = $1`, [gymId])
  ok(res, updated.rows[0])
})

// =============================================================================
// GET /gym/settings
// =============================================================================

gymRouter.get('/settings', can('settings:read'), async (req: Request, res: Response) => {
  const row = await tenantQuery(req.gymId,
    `SELECT * FROM gym_settings WHERE gym_id = $1`, [req.gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Gym settings')
  ok(res, row.rows[0])
})

// =============================================================================
// PATCH /gym/settings
// =============================================================================

gymRouter.patch('/settings', can('settings:edit'), async (req: Request, res: Response) => {
  const body  = UpdateSettingsSchema.parse(req.body)
  const gymId = req.gymId

  const fieldMap: Record<string, unknown> = {
    require_payment_for_checkin: body.requirePaymentForCheckin,
    checkin_grace_amount:        body.checkinGraceAmount,
    booking_lead_time_hrs:    body.bookingLeadTimeHrs,
    booking_max_advance_days: body.bookingMaxAdvanceDays,
    cancel_window_hrs:        body.cancelWindowHrs,
    no_show_fee:              body.noShowFee,
    allow_online_signup:      body.allowOnlineSignup,
    allow_guest_booking:      body.allowGuestBooking,
    access_mode:              body.accessMode,
    checkin_method:           body.checkinMethod,
    member_app_enabled:       body.memberAppEnabled,
    widget_enabled:           body.widgetEnabled,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  await tenantQuery(gymId,
    `UPDATE gym_settings SET ${set}, updated_at = NOW()
     WHERE gym_id = $${values.length + 1}`,
    [...values, gymId]
  )

  // Bust provider cache since Stripe account ID may have changed
  await cacheDel(key(gymId, 'payment:provider'))

  const updated = await tenantQuery(gymId,
    `SELECT * FROM gym_settings WHERE gym_id = $1`, [gymId]
  )
  ok(res, updated.rows[0])
})

// =============================================================================
// GET /gym/locations
// =============================================================================

gymRouter.get('/locations', can('settings:read'), async (req: Request, res: Response) => {
  const rows = await tenantQuery(req.gymId,
    `SELECT * FROM gym_locations WHERE gym_id = $1 AND is_active = TRUE ORDER BY is_primary DESC, name ASC`,
    [req.gymId]
  )
  ok(res, rows.rows)
})

// =============================================================================
// POST /gym/locations
// =============================================================================

gymRouter.post('/locations', can('settings:edit'), async (req: Request, res: Response) => {
  const body  = LocationSchema.parse(req.body)
  const gymId = req.gymId

  const row = await withTransaction(gymId, async (db) => {
    // If this is marked primary, unset any existing primary
    if (body.isPrimary) {
      await db.query(
        `UPDATE gym_locations SET is_primary = FALSE WHERE gym_id = $1`, [gymId]
      )
    }

    return db.one<{ id: string }>(`
      INSERT INTO gym_locations
        (gym_id, name, address_line1, address_line2, city, state,
         postcode, country, phone, email, is_primary, open_hours)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      gymId, body.name,
      body.addressLine1 ?? null, body.addressLine2 ?? null,
      body.city ?? null, body.state ?? null,
      body.postcode ?? null, body.country ?? null,
      body.phone ?? null, body.email ?? null,
      body.isPrimary,
      body.openHours ? JSON.stringify(body.openHours) : null,
    ])
  })

  created(res, row)
})

// =============================================================================
// PATCH /gym/locations/:id
// =============================================================================

gymRouter.patch('/locations/:id', can('settings:edit'), async (req: Request, res: Response) => {
  const body     = LocationSchema.partial().parse(req.body)
  const gymId    = req.gymId
  const locationId = req.params.id

  const fieldMap: Record<string, unknown> = {
    name:          body.name,
    address_line1: body.addressLine1,
    address_line2: body.addressLine2,
    city:          body.city,
    state:         body.state,
    postcode:      body.postcode,
    country:       body.country,
    phone:         body.phone,
    email:         body.email,
    open_hours:    body.openHours ? JSON.stringify(body.openHours) : undefined,
  }

  const updates = Object.entries(fieldMap).filter(([, v]) => v !== undefined)
  if (!updates.length) { ok(res, { message: 'No changes' }); return }

  const set    = updates.map(([col], i) => `${col} = $${i + 1}`).join(', ')
  const values = updates.map(([, v]) => v)

  const row = await tenantQuery(gymId,
    `UPDATE gym_locations SET ${set}, updated_at = NOW()
     WHERE id = $${values.length + 1} AND gym_id = $${values.length + 2}
     RETURNING *`,
    [...values, locationId, gymId]
  )
  if (!row.rows[0]) throw new NotFoundError('Location', locationId)
  ok(res, row.rows[0])
})

// =============================================================================
// DELETE /gym/locations/:id
// =============================================================================

gymRouter.delete('/locations/:id', can('settings:edit'), async (req: Request, res: Response) => {
  const gymId      = req.gymId
  const locationId = req.params.id

  await withTransaction(gymId, async (db) => {
    const loc = await db.one(
      `SELECT id, is_primary FROM gym_locations WHERE id = $1 AND gym_id = $2`,
      [locationId, gymId]
    )
    if (!loc) throw new NotFoundError('Location', locationId)
    if ((loc as any).is_primary) {
      throw new ConflictError('Cannot delete the primary location. Set another location as primary first.')
    }

    // Soft delete
    await db.query(
      `UPDATE gym_locations SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
      [locationId]
    )
  })

  noContent(res)
})

// =============================================================================
// GET /gym/integrations
// =============================================================================

gymRouter.get('/integrations', can('integrations:manage'), async (req: Request, res: Response) => {
  const rows = await tenantQuery(req.gymId, `
    SELECT provider, status, config, last_synced_at, error_message, created_at
    FROM   integrations
    WHERE  gym_id = $1
    ORDER  BY provider ASC
  `, [req.gymId])

  // Never return credentials in the response
  ok(res, rows.rows)
})

// =============================================================================
// POST /gym/integrations/connect
// =============================================================================

gymRouter.post('/integrations/connect', can('integrations:manage'), async (req: Request, res: Response) => {
  const body  = IntegrationSchema.parse(req.body)
  const gymId = req.gymId

  // In production: encrypt credentials before storing
  // For now store as JSON — add encryption layer (e.g. AES-256) before go-live
  await tenantQuery(gymId, `
    INSERT INTO integrations (gym_id, provider, status, credentials, config)
    VALUES ($1,$2,'connected',$3,$4)
    ON CONFLICT (gym_id, provider) DO UPDATE
    SET credentials = $3, config = $4, status = 'connected',
        error_message = NULL, updated_at = NOW()
  `, [gymId, body.provider,
      JSON.stringify(body.credentials),
      JSON.stringify(body.config ?? {})])

  // Bust payment provider cache
  await cacheDel(key(gymId, 'payment:provider'))

  ok(res, { message: `${body.provider} connected successfully` })
})

// =============================================================================
// DELETE /gym/integrations/:provider
// =============================================================================

gymRouter.delete('/integrations/:provider', can('integrations:manage'), async (req: Request, res: Response) => {
  const { gymId } = req
  const provider  = req.params.provider

  await tenantQuery(gymId,
    `UPDATE integrations SET status = 'disconnected', credentials = '{}', updated_at = NOW()
     WHERE gym_id = $1 AND provider = $2`,
    [gymId, provider]
  )

  await cacheDel(key(gymId, 'payment:provider'))

  noContent(res)
})

// =============================================================================
// POST /gym/integrations/:provider/test
// =============================================================================

gymRouter.post('/integrations/:provider/test', can('integrations:manage'), async (req: Request, res: Response) => {
  const { gymId } = req
  const provider  = req.params.provider

  const row = await tenantQuery(gymId,
    `SELECT credentials FROM integrations WHERE gym_id = $1 AND provider = $2`,
    [gymId, provider]
  )
  if (!row.rows[0]) throw new NotFoundError('Integration', provider)

  // Basic connectivity test — try to list customers/plans
  try {
    const creds = JSON.parse(row.rows[0].credentials)
    const { buildProvider } = await import('@/services/payment')
    const p = buildProvider(provider as any, creds.secret_key)
    await p.findCustomer('test@test.com')

    await tenantQuery(gymId,
      `UPDATE integrations SET last_synced_at = NOW(), error_message = NULL WHERE gym_id = $1 AND provider = $2`,
      [gymId, provider]
    )
    ok(res, { success: true, message: 'Connection successful' })
  } catch (err: any) {
    await tenantQuery(gymId,
      `UPDATE integrations SET status = 'error', error_message = $1 WHERE gym_id = $2 AND provider = $3`,
      [err.message, gymId, provider]
    )
    ok(res, { success: false, message: err.message })
  }
})