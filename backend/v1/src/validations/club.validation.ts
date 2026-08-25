import { Request, Response, NextFunction } from 'express'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

const validateClubSchema = Joi.object({
  tenant: Joi.string().hex().length(24).required(),
  logourl: Joi.string().optional(),
  brandName: Joi.string().required().trim(),
  companyName: Joi.string().required().trim(),
  description: Joi.string().trim().optional(),
  slogan: Joi.string().optional(),
  owner: Joi.string().hex().length(24).required(),
  primaryEmail: Joi.string().email().required().messages({ 'string.email': 'Email must be a valid email address', 'any.required': 'Email is required' }),
  secondaryEmail: Joi.string().email().required().messages({ 'string.email': 'Email must be a valid email address', 'any.required': 'Email is required' }),
  billingEmail: Joi.string().email().required().messages({ 'string.email': 'Email must be a valid email address', 'any.required': 'Email is required' }),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  appUrl: Joi.string().required(),
  location: Joi.string().required(),
  street: Joi.string().required(),
  suburb: Joi.string().required(),
  city: Joi.string().required(),
  postalCode: Joi.string().optional(),
  //createdAt: Joi.date().iso().required(),
  //updatedAt: Joi.date().iso().required(),
  //endDate: Joi.date().iso().greater(Joi.ref('startDate')).required(),
  status: Joi.string().valid('active', 'inactive', 'maintenance').default('active'),
  parentFacilityId: Joi.string().optional()
})

const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map((err) => err.message),
      });
    }
    next()
  }
}

//export validateClubSchema
export const validateClubForm = validate(validateClubSchema)

export { validateClubSchema }