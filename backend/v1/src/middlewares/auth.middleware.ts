import { Request, Response, NextFunction } from 'express'
import passport from 'passport'
import { Strategy as LocalStrategy } from 'passport-local'
import jwt from 'jsonwebtoken'
import { StatusCodes } from 'http-status-codes'
import { User } from '../models/user.model'
import { config } from '../config/env'
import logger from '../config/logger'
import { IUser } from '../types/auth.types'

interface AuthRequest extends Request {
 //authuser?: IUser
 user?: {
  id: string
  role: string
  tenantId: string
 }
}

passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findOne({ email }).select('+password') 
    if (!user) {
      logger.warn(`User not found: ${email} during authentication`)
      return done(null, false, { message: 'Incorrect email or password.' })
  }
  const isMatch = await user.comparePassword(password)
  if (!isMatch) {
    logger.warn(`Invalid password for user: ${email} during authentication`)
    return done(null, false, { message: 'Incorrect email or password.' })
  }
  logger.info(`User authenticated: ${email}`)
  return done(null, user)
  } catch (error) {
    logger.error(`Authentication error for user ${email}: ${error}`)
    return done(error)
  }
}))  


passport.serializeUser((user: any, done) => {
  done(null, user.id.toString())
})


passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('+password')
    done(null, user)
  } catch (error: any) {
    logger.error(`Deserialization error for user ID ${id}: ${error.message}`)
    done(error)
  }
})


export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1]
    //console.log(token)
    if (!token) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'No tokens provided' })
    }

    const payload = jwt.verify(token, config.jwtSecret) as { id: string, role: string, tenantId: string }
    const user = await User.findById(payload.id)
    if (!user) {
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' })
    }

    req.user = user
    //console.log(req.user)
    next()
  } catch (error) {
    console.error('Authentication error:', error)
    res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Invalid token' })
  }
}


export const restrictToRoles = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      logger.warn(`No authenticated user for request to ${req.path}`)
      console.log(req.user)
      return res.status(StatusCodes.UNAUTHORIZED).json({ message: 'Unauthorized' })
    }
    if (!roles.includes(req.user.role)) {
      logger.warn(`Forbidden: User role ${req.user.role} not allowed for User ${req.user.id} with roles ${roles.join(', ')} for request to ${req.path}`)
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Forbidden: Insufficient role' })
    }
    next()
  }
}
