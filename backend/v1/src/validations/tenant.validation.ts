import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const createTenantSchema = Joi.object({
  name: Joi.string().required().min(3).max(100),
});

const validate = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error } = schema.validate(req.body, { abortEarly: false });
    if (error) {
      return res.status(400).json({
        message: 'Validation error',
        details: error.details.map((err) => err.message),
      });
    }
    next();
  };
};

export const validateCreateTenant = validate(createTenantSchema);

export { createTenantSchema };