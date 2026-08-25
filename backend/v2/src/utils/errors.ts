import { Request, Response, NextFunction } from 'express'
import { ZodError } from 'zod'
import { logger } from '@/utils/logger'

// =============================================================================
// Error classes
// =============================================================================

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code:       string,
    message:                    string,
    public readonly details?:   unknown
  ) {
    super(message)
    this.name = 'AppError'
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(404, 'NOT_FOUND',
      id ? `${resource} '${id}' not found` : `${resource} not found`
    )
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHORIZED', message)
  }
}

export class ForbiddenError extends AppError {
  constructor(permission?: string) {
    super(403, 'FORBIDDEN',
      permission
        ? `Missing permission: ${permission}`
        : 'You do not have access to this resource'
    )
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details)
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message: string, details?: unknown) {
    super(402, 'PAYMENT_REQUIRED', message, details)
  }
}

export class TenantSuspendedError extends AppError {
  constructor() {
    super(403, 'TENANT_SUSPENDED',
      'This gym account has been suspended. Please contact support.'
    )
  }
}

// =============================================================================
// Global error handler — registered last in Express
// =============================================================================

export function errorHandler(
  err:   unknown,
  req:   Request,
  res:   Response,
  _next: NextFunction
): void {

  // ── Zod validation errors ─────────────────────────────────────────────────
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code:    'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.flatten().fieldErrors,
      },
    })
    return
  }

  // ── Known application errors ──────────────────────────────────────────────
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error('Application error', {
        code:   err.code,
        stack:  err.stack,
        url:    req.url,
        method: req.method,
      })
    }
    res.status(err.statusCode).json({
      success: false,
      error: {
        code:    err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    })
    return
  }

  // ── Postgres unique violation ─────────────────────────────────────────────
  if ((err as any)?.code === '23505') {
    res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'A record with this value already exists' },
    })
    return
  }

  // ── Postgres FK violation ─────────────────────────────────────────────────
  if ((err as any)?.code === '23503') {
    res.status(422).json({
      success: false,
      error: { code: 'INVALID_REFERENCE', message: 'Referenced record does not exist' },
    })
    return
  }

  // ── Postgres check constraint ─────────────────────────────────────────────
  if ((err as any)?.code === '23514') {
    res.status(422).json({
      success: false,
      error: { code: 'CONSTRAINT_VIOLATION', message: 'The value violates a data constraint' },
    })
    return
  }

  // ── Unknown errors ────────────────────────────────────────────────────────
  logger.error('Unhandled error', {
    error:  (err as Error)?.message,
    stack:  (err as Error)?.stack,
    url:    req.url,
    method: req.method,
  })

  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  })
}

// =============================================================================
// Response helpers
// =============================================================================

export function ok<T>(res: Response, data: T, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data })
}

export function created<T>(res: Response, data: T): void {
  ok(res, data, 201)
}

export function paginated<T>(
  res:   Response,
  data:  T[],
  total: number,
  page:  number,
  limit: number
): void {
  res.status(200).json({
    success: true,
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext:    page * limit < total,
      hasPrev:    page > 1,
    },
  })
}

export function noContent(res: Response): void {
  res.status(204).send()
}