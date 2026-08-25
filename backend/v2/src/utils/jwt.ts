import jwt from 'jsonwebtoken'
import { env } from '@/config/env'
import { UnauthorizedError } from '@/utils/errors'

// =============================================================================
// Token payload shapes
// =============================================================================

export interface AccessTokenPayload {
  sub:       string        // user_id
  gymId:     string        // resolved gym tenant
  staffId?:  string        // present for staff; absent for members
  memberId?: string        // present for members; absent for staff
  role?:     string        // owner | manager | trainer | front_desk | instructor
  type:      'access'
}

export interface RefreshTokenPayload {
  sub:   string            // user_id
  gymId: string
  jti:   string            // unique token ID — stored in Redis for revocation
  type:  'refresh'
}

export interface DeviceTokenPayload {
  deviceId:   string
  gymId:      string
  locationId: string
  type:       'device'
}

// =============================================================================
// Sign
// =============================================================================

export function signAccessToken(
  payload: Omit<AccessTokenPayload, 'type'>
): string {
  return jwt.sign(
    { ...payload, type: 'access' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as any }
  )
}

export function signRefreshToken(
  payload: Omit<RefreshTokenPayload, 'type'>
): string {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN as any }
  )
}

// Device tokens are long-lived — refreshed on device heartbeat
export function signDeviceToken(
  payload: Omit<DeviceTokenPayload, 'type'>
): string {
  return jwt.sign(
    { ...payload, type: 'device' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '365d' as any }
  )
}

// =============================================================================
// Verify
// =============================================================================

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload
    if (payload.type !== 'access') throw new Error('Wrong token type')
    return payload
  } catch (err: any) {
    if (err instanceof UnauthorizedError) throw err
    if (err.name === 'TokenExpiredError')  throw new UnauthorizedError('Token expired')
    if (err.name === 'JsonWebTokenError')  throw new UnauthorizedError('Invalid token')
    throw new UnauthorizedError('Token verification failed')
  }
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload
    if (payload.type !== 'refresh') throw new Error('Wrong token type')
    return payload
  } catch (err: any) {
    if (err instanceof UnauthorizedError) throw err
    if (err.name === 'TokenExpiredError')  throw new UnauthorizedError('Refresh token expired')
    throw new UnauthorizedError('Invalid refresh token')
  }
}

export function verifyDeviceToken(token: string): DeviceTokenPayload {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as DeviceTokenPayload
    if (payload.type !== 'device') throw new Error('Wrong token type')
    return payload
  } catch (err: any) {
    if (err instanceof UnauthorizedError) throw err
    throw new UnauthorizedError('Invalid device token')
  }
}

// =============================================================================
// Helpers
// =============================================================================

// Pulls the raw token string out of "Bearer <token>"
export function extractBearer(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token.length ? token : null
}