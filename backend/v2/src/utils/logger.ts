import winston from 'winston'
import { env } from '@/config/env'

const { combine, timestamp, errors, json, colorize, simple } = winston.format

export const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    env.NODE_ENV === 'production'
      ? json()
      : combine(colorize(), simple())
  ),
  defaultMeta: { service: 'gym-api' },
  transports: [new winston.transports.Console()],
})