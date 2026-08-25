import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { v4 as uuid } from 'uuid'
import { query } from '@/db/pool'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '@/utils/jwt'
import {
  storeRefreshToken,
  refreshTokenExists,
  deleteRefreshToken,
  deleteAllRefreshTokens,
} from '@/db/redis'
import { UnauthorizedError, ValidationError, NotFoundError } from '@/utils/errors'
import { ok } from '@/utils/errors'
import { authenticate, resolveTenant } from '@/middleware'
import { env } from '@/config/env'
import { logger } from '@/utils/logger'

export const authRouter = Router()

// ─── Schemas ──────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
  gymSlug:  z.string().min(1),
})

const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
})

const ForgotSchema = z.object({
  email:   z.string().email(),
  gymSlug: z.string().min(1),
})

const ResetSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword:     z.string().min(8),
})

// ─── Refresh TTL in seconds (30 days) ────────────────────────────────────────
const REFRESH_TTL = 30 * 24 * 60 * 60

// =============================================================================
// POST /auth/login
// =============================================================================

authRouter.post('/login', async (req: Request, res: Response) => {
  const body = LoginSchema.parse(req.body)

  // 1. Resolve gym by slug
  const gymRow = await query<{ id: string; subscription_status: string }>(
    `SELECT id, subscription_status FROM gyms WHERE slug = $1`,
    [body.gymSlug]
  )
  const gym = gymRow.rows[0]
  if (!gym) throw new NotFoundError('Gym', body.gymSlug)
  if (gym.subscription_status === 'suspended') {
    throw new UnauthorizedError('This gym account has been suspended')
  }

  // 2. Find user by email
  const userRow = await query<{
    id: string; password_hash: string; email_verified: boolean
  }>(
    `SELECT id, password_hash, email_verified FROM users WHERE email = $1`,
    [body.email]
  )
  const user = userRow.rows[0]

  // 3. Verify password — always run bcrypt even if user not found
  //    to prevent timing attacks that reveal whether an email exists
  const hash  = user?.password_hash ?? '$2b$12$invalidhashpaddingtopreventimenumeration'
  const valid = await bcrypt.compare(body.password, hash)
  if (!user || !valid) throw new UnauthorizedError('Invalid email or password')

  if (!user.email_verified) {
    throw new UnauthorizedError('Please verify your email address before logging in')
  }

  // 4. Check this user has a record in this gym (staff or member)
  const [staffRow, memberRow] = await Promise.all([
    query<{ id: string; role: string; is_active: boolean }>(
      `SELECT id, role, is_active FROM staff
       WHERE user_id = $1 AND gym_id = $2`,
      [user.id, gym.id]
    ),
    query<{ id: string; status: string }>(
      `SELECT id, status FROM members
       WHERE user_id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [user.id, gym.id]
    ),
  ])

  const staff  = staffRow.rows[0]
  const member = memberRow.rows[0]

  if (!staff && !member) {
    throw new UnauthorizedError('No account found for this gym')
  }
  if (staff && !staff.is_active) {
    throw new UnauthorizedError('Your staff account has been deactivated')
  }
  if (member && member.status === 'banned') {
    throw new UnauthorizedError('Your membership has been suspended')
  }

  // 5. Update last login
  await query(
    `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
    [user.id]
  )

  // 6. Sign tokens
  const jti          = uuid()
  const accessToken  = signAccessToken({
    sub:      user.id,
    gymId:    gym.id,
    staffId:  staff?.id,
    memberId: member?.id,
    role:     staff?.role,
  })
  const refreshToken = signRefreshToken({ sub: user.id, gymId: gym.id, jti })

  await storeRefreshToken(user.id, jti, REFRESH_TTL)

  logger.info('Login successful', {
    userId: user.id,
    gymId:  gym.id,
    role:   staff?.role ?? 'member',
  })

  ok(res, {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // seconds
    user: {
      id:       user.id,
      gymId:    gym.id,
      staffId:  staff?.id,
      memberId: member?.id,
      role:     staff?.role,
    },
  })
})

// =============================================================================
// POST /auth/refresh
// =============================================================================

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = RefreshSchema.parse(req.body)

  // 1. Verify signature and expiry
  const payload = verifyRefreshToken(refreshToken)

  // 2. Check token exists in Redis (revocation check)
  const exists = await refreshTokenExists(payload.sub, payload.jti)
  if (!exists) throw new UnauthorizedError('Refresh token has been revoked')

  // 3. Rotate — delete old, issue new
  await deleteRefreshToken(payload.sub, payload.jti)

  // 4. Re-fetch roles in case they changed since last login
  const [staffRow, memberRow] = await Promise.all([
    query<{ id: string; role: string }>(
      `SELECT id, role FROM staff
       WHERE user_id = $1 AND gym_id = $2 AND is_active = TRUE`,
      [payload.sub, payload.gymId]
    ),
    query<{ id: string }>(
      `SELECT id FROM members
       WHERE user_id = $1 AND gym_id = $2 AND deleted_at IS NULL`,
      [payload.sub, payload.gymId]
    ),
  ])

  const staff  = staffRow.rows[0]
  const member = memberRow.rows[0]

  const newJti          = uuid()
  const newAccessToken  = signAccessToken({
    sub:      payload.sub,
    gymId:    payload.gymId,
    staffId:  staff?.id,
    memberId: member?.id,
    role:     staff?.role,
  })
  const newRefreshToken = signRefreshToken({
    sub:   payload.sub,
    gymId: payload.gymId,
    jti:   newJti,
  })

  await storeRefreshToken(payload.sub, newJti, REFRESH_TTL)

  ok(res, {
    accessToken:  newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn:    15 * 60,
  })
})

// =============================================================================
// POST /auth/logout
// =============================================================================

authRouter.post('/logout', authenticate, async (req: Request, res: Response) => {
  const { refreshToken } = RefreshSchema.parse(req.body)

  try {
    const payload = verifyRefreshToken(refreshToken)
    await deleteRefreshToken(payload.sub, payload.jti)
  } catch {
    // Token already expired or invalid — still return success
    // The access token will expire on its own (15m)
  }

  ok(res, { message: 'Logged out successfully' })
})

// =============================================================================
// POST /auth/logout-all  (revoke every session for this user)
// =============================================================================

authRouter.post('/logout-all', authenticate, async (req: Request, res: Response) => {
  await deleteAllRefreshTokens(req.auth.sub)
  ok(res, { message: 'All sessions revoked' })
})

// =============================================================================
// POST /auth/forgot-password
// =============================================================================

authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  const body = ForgotSchema.parse(req.body)

  const result = await query<{ id: string }>(
    `SELECT u.id FROM users u
     WHERE u.email = $1
       AND (
         EXISTS (
           SELECT 1 FROM staff s
           JOIN gyms g ON g.id = s.gym_id
           WHERE s.user_id = u.id AND g.slug = $2
         )
         OR EXISTS (
           SELECT 1 FROM members m
           JOIN gyms g ON g.id = m.gym_id
           WHERE m.user_id = u.id AND g.slug = $2 AND m.deleted_at IS NULL
         )
       )
     LIMIT 1`,
    [body.email, body.gymSlug]
  )

  if (result.rows[0]) {
    const token   = uuid()
    const expires = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await query(
      `UPDATE users
       SET password_reset_token = $1, password_reset_expires_at = $2
       WHERE id = $3`,
      [token, expires, result.rows[0].id]
    )
    // TODO: enqueue email job → send reset link
    logger.info('Password reset requested', { email: body.email })
  }

  // Always return the same response to prevent email enumeration
  ok(res, { message: 'If that email exists, a reset link has been sent' })
})

// =============================================================================
// POST /auth/reset-password
// =============================================================================

authRouter.post('/reset-password', async (req: Request, res: Response) => {
  const body = ResetSchema.parse(req.body)

  const result = await query<{ id: string }>(
    `SELECT id FROM users
     WHERE password_reset_token = $1
       AND password_reset_expires_at > NOW()`,
    [body.token]
  )
  const user = result.rows[0]
  if (!user) throw new ValidationError('Invalid or expired reset token')

  const hash = await bcrypt.hash(body.password, env.BCRYPT_ROUNDS)

  await query(
    `UPDATE users
     SET password_hash = $1,
         password_reset_token = NULL,
         password_reset_expires_at = NULL
     WHERE id = $2`,
    [hash, user.id]
  )

  // Revoke all existing sessions — force re-login with new password
  await deleteAllRefreshTokens(user.id)

  ok(res, { message: 'Password reset successfully. Please log in.' })
})

// =============================================================================
// GET /auth/me
// =============================================================================

authRouter.get('/me', authenticate, resolveTenant, async (req: Request, res: Response) => {
  try {
    const { sub: userId, gymId, staffId, memberId, role } = req.auth

    let permissions: string[] = []
    if (staffId) {
      const permResult = await query<{ permission_key: string }>(
        `SELECT permission_key FROM get_staff_permissions($1, $2)`,
        [gymId, staffId]
      )
      permissions = permResult.rows.map(r => r.permission_key)
    }

    const gymResult = await query<{ name: string; slug: string; logo_url: string }>(
      `SELECT name, slug, logo_url FROM gyms WHERE id = $1`,
      [gymId]
    )

    ok(res, {
      userId, gymId, gym: gymResult.rows[0],
      staffId, memberId, role, permissions,
    })
  } catch (err: any) {
    console.error('GET /auth/me error:', err.message, err.stack)
    throw err
  }
})

// =============================================================================
// PATCH /auth/change-password
// =============================================================================

authRouter.patch(
  '/change-password',
  authenticate,
  async (req: Request, res: Response) => {
    const body = ChangePasswordSchema.parse(req.body)

    const result = await query<{ password_hash: string }>(
      `SELECT password_hash FROM users WHERE id = $1`,
      [req.auth.sub]
    )
    const user = result.rows[0]

    const valid = await bcrypt.compare(body.currentPassword, user.password_hash)
    if (!valid) throw new ValidationError('Current password is incorrect')

    const hash = await bcrypt.hash(body.newPassword, env.BCRYPT_ROUNDS)
    await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [hash, req.auth.sub]
    )

    // Revoke all sessions — user must log in again
    await deleteAllRefreshTokens(req.auth.sub)

    ok(res, { message: 'Password changed. Please log in again.' })
  }
)