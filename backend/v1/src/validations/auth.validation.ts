import { NextFunction, Request, Response } from 'express'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import owasp from 'owasp-password-strength-test'

const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => 
    {
      console.log(`Validating request body for ${req.path}: ${JSON.stringify(req.body, null, 2)}`)
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true })
    if (error) {
      const errorMessage = error.details.map((detail) => detail.message).join(', ')
      console.error(`Validation error for ${req.path}: ${errorMessage}`)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: errorMessage })
    }
    req.body = value // Assign validated values to req.body
    next()
  }
}

export const validateSignup = validate(
  Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email must be a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(6).required().custom((value, helpers) => {
      const result = owasp.test(value)
      if (!result.strong) {
        const errorMessage = result.errors.join(', ')
        return helpers.error('any.invalid', { message: `Password is too weak: ${errorMessage}` })
      }
      return value 
    }).messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required',
      'any.invalid': 'Password is too weak. Use a stronger password with length 8+, mixed case, numbers, and special characters.'
    }),
    role: Joi.string().valid('guest' ,'front_desk','housekeeping', 'manager', 'admin', 'tenant_admin', 'SYSTEM_ADMIN').required().messages({
      'any.only': 'Role must be one of: guest, front_desk, housekeeping, manager, admin, tenant_admin, SYSTEM_ADMIN',
      'any.required': 'Role is required'
    }),
    tenantId: Joi.string().when('role', {
      is: 'guest',
      then: Joi.string().optional(),
      otherwise: Joi.string().required()
    })
  })
)

export const validateLogin = validate(
  Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Email must be a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().required().messages({
      'any.required': 'Password is required',
      'string.base': 'Password must be a string'
    })
  })
)

export const validateVerify2FA = validate(
  Joi.object({
    userId: Joi.string().required().messages({
      'any.required': 'User ID is required'
    }),
    token: Joi.string().required().messages({
      'any.required': '2FA token is required'
    })
  })
)

export const validateRefreshToken = validate(
  Joi.object({
    token: Joi.string().required().messages({
      'any.required': 'Refresh token is required'
    })
  })
)
