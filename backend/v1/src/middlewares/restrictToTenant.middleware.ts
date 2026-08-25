import { Request, Response, NextFunction } from 'express'
import { StatusCodes } from 'http-status-codes'
import logger from '../config/logger'



interface AuthRequest extends Request {
 //authuser?: IUser
 user?: {
  id: string
  role: string
  tenantId: string
 }
}

export const restrictToTenant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      logger.warn(`No authenticated user for request to ${req.path}`)
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Authentication required' })
    }

    const requestedTenant =  req.params.tenantId || req.body.tenantId || req.query.tenantId
    console.log(`Requested Tenant: ${requestedTenant}, User Tenant: ${req.params.tenantId}`)
    

    if (req.user.role === 'SYSTEM_ADMIN') {
      logger.info(`SYSTEM_ADMIN access granted to user: ${req.user.id} for request to ${req.path}`)
      return next() // SYSTEM_ADMIN has access to all tenants
    }

    if (!requestedTenant) {
      logger.warn(` ${ req.params.tenantId } No tenantId provided in request to ${req.path} by user: ${req.user.id}`)
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Tenant ID is required' })
    }

    if (req.user?.tenantId?.toString() !== requestedTenant) {
      logger.warn(
        `Unauthorized tenant access:user ${req.user.id} of type ${typeof req.user.id} with tenant ${req.user.tenantId} of type ${typeof req.user.tenantId} tried to access tenant ${requestedTenant} of type ${typeof requestedTenant}`)
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized tenant access' })
 }

 logger.info(`Tenant access granted for user ${req.user.id} to tenant ${requestedTenant}`)
  next()
} catch (error: any) {
  logger.error(`Error occurred while restricting tenant access: ${error.message}`)
  return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Internal server error' })
}
}
