import { ConnectionOptions, DefaultJobOptions } from 'bullmq'
import { env } from '@/config/env'

// BullMQ needs its own Redis connection — separate from the app cache client.
// BullMQ uses blocking commands (BLPOP) that tie up a connection permanently,
// so it cannot share the connection used for SET/GET cache operations.

export const bullConnection: ConnectionOptions = {
  url:                    env.REDIS_URL,
  maxRetriesPerRequest:   null,  // required by BullMQ
  enableReadyCheck:       false,
}

// ─── Default job options per priority tier ────────────────────────────────────

// Critical: billing, access decisions
export const criticalOpts: DefaultJobOptions = {
  attempts: 5,
  backoff:  { type: 'exponential', delay: 2_000 },
  removeOnComplete: { count: 500 },
  removeOnFail:     { count: 2_000 },
}

// Standard: notifications, CRM tasks
export const standardOpts: DefaultJobOptions = {
  attempts: 3,
  backoff:  { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 200 },
  removeOnFail:     { count: 1_000 },
}

// Low priority: analytics snapshots, exports, bulk sends
export const lowOpts: DefaultJobOptions = {
  attempts: 3,
  backoff:  { type: 'fixed', delay: 30_000 },
  removeOnComplete: { count: 100 },
  removeOnFail:     { count: 500 },
}