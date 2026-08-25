import 'express-async-errors'
import express, { Router } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'

import { env } from '@/config/env'
import { logger } from '@/utils/logger'
import { connectRedis, checkRedisHealth, closeRedis } from '@/db/redis'
import { checkDbHealth, closeDb } from '@/db/pool'
import { errorHandler } from '@/utils/errors'
import { authRouter } from '@/modules/auth/auth.router'
import { membersRouter } from '@/modules/members/members.router'
import { subscriptionsRouter } from '@/modules/subscriptions/subscriptions.router'
import { classesRouter } from '@/modules/classes/classes.router'
import { bookingsRouter } from '@/modules/bookings/bookings.router'
import { checkinsRouter } from '@/modules/checkins/checkins.router'
import { staffRouter } from '@/modules/staff/staff.router'
import { paymentsRouter } from '@/modules/payments/payments.router'
import { webhooksRouter } from '@/modules/payments/webhooks.router'
import { startJobWorkers } from '@/jobs'
import { analyticsRouter } from '@/modules/analytics/analytics.router'
import { gymRouter } from '@/modules/gym/gym.router'
import { leadsRouter } from '@/modules/leads/leads.router'
import { plansRouter } from '@/modules/plans/plans.router'
import { adminRouter } from '@/modules/admin/admin.router'
import { join } from 'path'
const app = express()

// ─── Security ─────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false })) // Disable to allow serving images; fine since we don't serve user-uploaded files
const corsOptions = {
  origin:         env.CORS_ORIGINS.split(',').map(o => o.trim()),
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.options('*', cors(corsOptions)) // Enable pre-flight for all routes

// ─── Performance ──────────────────────────────────────────────────────────────
app.use(compression())
app.use(rateLimit({
  windowMs:        env.RATE_LIMIT_WINDOW_MS,
  max:             env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
}))

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use('/api/webhooks', express.raw({ type: 'application/json' })) // Webhooks may need raw body, so register before json parser 
app.use(express.json({ limit: '1mb' }))
app.use(express.urlencoded({ extended: true }))

// ─── Logging ──────────────────────────────────────────────────────────────────
if (env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: msg => logger.http(msg.trim()) },
  }))
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const [db, redis] = await Promise.all([checkDbHealth(), checkRedisHealth()])
  const healthy = db && redis
  res.status(healthy ? 200 : 503).json({
    status:    healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services:  { db, redis },
  })
})

// ─── Routes ──────────────────────────────────────────────────────────────────────
const api = Router()
api.use('/auth', authRouter)
api.use('/members', membersRouter)
api.use('/subscriptions', subscriptionsRouter)
api.use('/classes', classesRouter)
api.use('/bookings', bookingsRouter)
api.use('/checkins', checkinsRouter)
api.use('/staff', staffRouter)
api.use('/payments', paymentsRouter)
api.use('/webhooks', webhooksRouter)
api.use('/analytics', analyticsRouter)
api.use('/gym', gymRouter)
api.use('/leads', leadsRouter)
api.use('/plans', plansRouter)
api.use('/admin', adminRouter)
//modules added here as we build them

app.use('/api', api)

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Route not found' } })
})

// ─── Global error handler (must be last) ──────────────────────────────────────
app.use(errorHandler)

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function start() {
  await connectRedis()
  // Only run job workers in production
  if (process.env.NODE_ENV === 'production') {
  await startJobWorkers()
}
  //await startJobWorkers()

  const server = app.listen(env.PORT, () => {
    logger.info(`API running on port ${env.PORT} [${env.NODE_ENV}]`)
  })

  const shutdown = async (signal: string) => {
    logger.info(`${signal} — shutting down`)
    server.close(async () => {
      await Promise.all([closeDb(), closeRedis()])
      logger.info('Shutdown complete')
      process.exit(0)
    })
    setTimeout(() => process.exit(1), 10_000)
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT',  () => shutdown('SIGINT'))
}

start()

export { app }