import { Request, Response, NextFunction } from 'express'
import {
  verifyAccessToken,
  verifyDeviceToken,
  extractBearer,
  AccessTokenPayload,
} from '@/utils/jwt'
import {
  UnauthorizedError,
  ForbiddenError,
  TenantSuspendedError,
} from '@/utils/errors'
import { query } from '@/db/pool'
import { key, cacheAside, TTL } from '@/db/redis'

// =============================================================================
// Extend Express Request
// =============================================================================

declare global {
  namespace Express {
    interface Request {
      auth:      AccessTokenPayload
      gymId:     string
      staffId?:  string
      memberId?: string
    }
  }
}

// =============================================================================
// 1. Authentication
// =============================================================================

// Requires a valid access token — throws 401 if missing or invalid
export function authenticate(
  req:  Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearer(req.headers.authorization)
  if (!token) throw new UnauthorizedError('Missing authorization header')

  const payload  = verifyAccessToken(token)
  req.auth       = payload
  req.gymId      = payload.gymId
  req.staffId    = payload.staffId
  req.memberId   = payload.memberId

  next()
}

// Token is used if present but missing is not an error (public routes)
export function optionalAuth(
  req:  Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearer(req.headers.authorization)
  if (token) {
    try {
      const payload  = verifyAccessToken(token)
      req.auth       = payload
      req.gymId      = payload.gymId
      req.staffId    = payload.staffId
      req.memberId   = payload.memberId
    } catch {
      // Silently ignore on optional routes
    }
  }
  next()
}

// For door controllers and access hardware
export function authenticateDevice(
  req:  Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearer(req.headers.authorization)
  if (!token) throw new UnauthorizedError('Missing device token')

  const payload = verifyDeviceToken(token)
  req.auth  = { sub: payload.deviceId, gymId: payload.gymId, type: 'access' }
  req.gymId = payload.gymId

  next()
}

// =============================================================================
// 2. Tenant resolution
// =============================================================================

// Validates the gym exists and is not suspended.
// Cache the status for MEDIUM TTL — avoids a DB hit on every request
export async function resolveTenant(
  req:  Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const gymId = req.gymId
  if (!gymId) throw new UnauthorizedError('No gym context in token')

  const cacheKey = key(gymId, 'gym:status')

  const status = await cacheAside<string | null>(cacheKey, TTL.MEDIUM, async () => {
    const result = await query<{ subscription_status: string }>(
      `SELECT subscription_status FROM gyms WHERE id = $1`,
      [gymId]
    )
    return result.rows[0]?.subscription_status ?? null
  })

  if (!status)               throw new UnauthorizedError('Gym not found')
  if (status === 'suspended') throw new TenantSuspendedError()

  next()
}

// =============================================================================
// 3. Permission checks
// =============================================================================

// Requires a specific permission — factory returns middleware
// Usage: router.get('/members', authenticate, resolveTenant, can('members:read'), handler)
export function can(permission: string) {
  return async (
    req:  Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.staffId) throw new ForbiddenError(permission)
    const allowed = await hasPermission(req.gymId, req.staffId, permission)
    if (!allowed) throw new ForbiddenError(permission)
    next()
  }
}

// Requires ALL listed permissions
export function canAll(...permissions: string[]) {
  return async (
    req:  Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.staffId) throw new ForbiddenError(permissions[0])
    for (const p of permissions) {
      if (!await hasPermission(req.gymId, req.staffId, p)) throw new ForbiddenError(p)
    }
    next()
  }
}

// Requires AT LEAST ONE of the listed permissions
export function canAny(...permissions: string[]) {
  return async (
    req:  Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    if (!req.staffId) throw new ForbiddenError()
    for (const p of permissions) {
      if (await hasPermission(req.gymId, req.staffId, p)) { next(); return }
    }
    throw new ForbiddenError(permissions.join(' | '))
  }
}

// Allows a member to access their own resource OR staff with the right permission
// Usage: can.selfOr(req => req.params.id, 'members:read')
export function selfOr(
  getMemberId: (req: Request) => string,
  permission:  string
) {
  return async (
    req:  Request,
    _res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Member accessing their own data
    if (req.memberId && req.memberId === getMemberId(req)) {
      next(); return
    }
    // Staff with permission
    if (!req.staffId) throw new ForbiddenError(permission)
    if (!await hasPermission(req.gymId, req.staffId, permission)) {
      throw new ForbiddenError(permission)
    }
    next()
  }
}

// Staff-only routes (any authenticated staff, no specific permission needed)
export function isStaff(
  req:  Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.staffId) throw new ForbiddenError('Staff access required')
  next()
}

// Owner-only routes
export function isOwner(
  req:  Request,
  _res: Response,
  next: NextFunction
): void {
  if (req.auth?.role !== 'owner') throw new ForbiddenError('Owner access required')
  next()
}

// Member-only routes (rejects staff tokens)
export function isMember(
  req:  Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.memberId) throw new ForbiddenError('Member access required')
  next()
}

// =============================================================================
// Permission resolver — cached per staff member
// =============================================================================

async function hasPermission(
  gymId:      string,
  staffId:    string,
  permission: string
): Promise<boolean> {
  // Gym owner bypasses all permission checks
  if (await isOwner_(gymId, staffId)) return true

  // Load full permission set from DB, cache for MEDIUM TTL
  // Busted when roles or overrides change (handled in staff/permissions routes)
  const cacheKey = key(gymId, 'perms', staffId)
  const perms    = await cacheAside<string[]>(cacheKey, TTL.MEDIUM, async () => {
    const result = await query<{ permission_key: string }>(
      `SELECT permission_key FROM get_staff_permissions($1, $2)`,
      [gymId, staffId]
    )
    return result.rows.map(r => r.permission_key)
  })

  return perms.includes(permission)
}

async function isOwner_(gymId: string, staffId: string): Promise<boolean> {
  const cacheKey = key(gymId, 'staff:role', staffId)
  const role     = await cacheAside<string>(cacheKey, TTL.LONG, async () => {
    const result = await query<{ role: string }>(
      `SELECT role FROM staff WHERE id = $1 AND gym_id = $2`,
      [staffId, gymId]
    )
    return result.rows[0]?.role ?? 'none'
  })
  return role === 'owner'
}

// =============================================================================
// Pagination helper
// =============================================================================

export interface Pagination {
  page:   number
  limit:  number
  offset: number
}

export function paginate(req: Request): Pagination {
  const page  = Math.max(1, parseInt(req.query.page  as string) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20))
  return { page, limit, offset: (page - 1) * limit }
}