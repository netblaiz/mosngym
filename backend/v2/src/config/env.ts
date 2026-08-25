import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config()

const envSchema = z.object({
  NODE_ENV:               z.enum(['development', 'test', 'production']).default('development'),
  PORT:                   z.coerce.number().default(3000),
  APP_URL:                z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS:           z.string().default('http://localhost:5173'),

  DATABASE_URL:           z.string(),
  DATABASE_POOL_MIN:      z.coerce.number().default(2),
  DATABASE_POOL_MAX:      z.coerce.number().default(20),

  REDIS_URL:              z.string().default('redis://localhost:6379'),

  JWT_ACCESS_SECRET:      z.string().min(32),
  JWT_REFRESH_SECRET:     z.string().min(32),
  JWT_ACCESS_EXPIRES_IN:  z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  STRIPE_SECRET_KEY:      z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET:  z.string().startsWith('whsec_'),

  BCRYPT_ROUNDS:          z.coerce.number().default(12),
  RATE_LIMIT_WINDOW_MS:   z.coerce.number().default(15 * 60 * 1000),
  RATE_LIMIT_MAX:         z.coerce.number().default(100),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  console.error('❌  Invalid environment variables:')
  console.error(result.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = result.data
export type Env = typeof env