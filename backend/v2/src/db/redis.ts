import { createClient, RedisClientType } from 'redis'
import { env } from '@/config/env'
import { logger } from '@/utils/logger'

// ─── Client ───────────────────────────────────────────────────────────────────

let client: RedisClientType

export async function connectRedis(): Promise<void> {
  client = createClient({ url: env.REDIS_URL }) as RedisClientType
  client.on('error',       (err) => logger.error('Redis error', { error: err.message }))
  client.on('reconnecting', ()   => logger.warn('Redis reconnecting…'))
  await client.connect()
  logger.info('Redis connected')
}

export function getRedis(): RedisClientType {
  if (!client) throw new Error('Redis not initialised — call connectRedis() first')
  return client
}

export async function closeRedis(): Promise<void> {
  await client?.quit()
  logger.info('Redis closed')
}

// ─── TTL constants (seconds) ──────────────────────────────────────────────────

export const TTL = {
  SHORT:  30,           // 30 sec — live occupancy, check-in counts
  MEDIUM: 2 * 60,       // 2 min  — dashboard KPIs, permission sets
  LONG:   10 * 60,      // 10 min — timetable, membership plans
  DAY:    60 * 60,      // 1 hr   — analytics snapshots (was 24hr)
} as const

// ─── Key builder — namespaced per gym to prevent cross-tenant collisions ──────

export function key(gymId: string, ...parts: string[]): string {
  return `gym:${gymId}:${parts.join(':')}`
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheGet<T>(k: string): Promise<T | null> {
  const val = await getRedis().get(k)
  if (!val) return null
  try { return JSON.parse(val) as T } catch { return null }
}

export async function cacheSet(k: string, value: unknown, ttl: number): Promise<void> {
  await getRedis().setEx(k, ttl, JSON.stringify(value))
}

export async function cacheDel(k: string): Promise<void> {
  await getRedis().del(k)
}

// Delete all keys matching a prefix — use when something broad changes
// e.g. cacheBust('gym:abc123:') clears all cache for that gym
export async function cacheBust(prefix: string): Promise<void> {
  const keys = await getRedis().keys(`${prefix}*`)
  if (keys.length) await getRedis().del(keys)
}

// Cache-aside: return cached value or compute it, store, and return
export async function cacheAside<T>(
  k: string,
  ttl: number,
  fn: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(k)
  if (cached !== null) return cached
  const fresh = await fn()
  await cacheSet(k, fresh, ttl)
  return fresh
}

// ─── Refresh token store ──────────────────────────────────────────────────────
// Redis is the source of truth for token validity.
// On logout or password change the token is deleted here — instantly invalid.

export async function storeRefreshToken(
  userId: string,
  jti: string,
  ttlSeconds: number
): Promise<void> {
  await getRedis().setEx(`refresh:${userId}:${jti}`, ttlSeconds, '1')
}

export async function refreshTokenExists(userId: string, jti: string): Promise<boolean> {
  return (await getRedis().exists(`refresh:${userId}:${jti}`)) === 1
}

export async function deleteRefreshToken(userId: string, jti: string): Promise<void> {
  await getRedis().del(`refresh:${userId}:${jti}`)
}

export async function deleteAllRefreshTokens(userId: string): Promise<void> {
  const keys = await getRedis().keys(`refresh:${userId}:*`)
  if (keys.length) await getRedis().del(keys)
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function checkRedisHealth(): Promise<boolean> {
  try { await getRedis().ping(); return true } catch { return false }
}