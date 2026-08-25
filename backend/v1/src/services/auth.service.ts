import jwt from 'jsonwebtoken'
import { StatusCodes } from 'http-status-codes'
import zxcvbn from 'zxcvbn'
import { User } from '../models/user.model'
import { Tenant } from '../models/tenant.model'
import { config } from '../config/env'
import { generateTOTPToken, generateTOTPSecret } from '../helpers/otp.helper'
import { IUser, ILoginResponse, IRefreshToken } from '../types/auth.types'
import logger  from '../config/logger'

const MIN_PASSWORD_SCORE = 3 // Password strength threshold (0-4)

export const assessPasswordStrength = (password: string):  {
score: number;
feedback: { warning: string; suggestions: string[]} 
} => {
  const result = zxcvbn(password)
  return { score: result.score, 
           feedback: {
              warning: result.feedback.warning || 'Password is weak',
              suggestions: result.feedback.suggestions || ['Use a mix of letters, numbers, and special characters', 'Make it longer than 8 characters']
           }
          }}

export const signup = async (
  email: string,
  password: string,
  role: string,
  tenantId?: string,
  clubId?: string
): Promise<IUser> => {
  try {

    if (role === 'SYSTEM_ADMIN') {
      throw new Error('SYSTEM_ADMIN role cannot be created via signup', { cause: StatusCodes.FORBIDDEN })
    }
    if (role === 'guest' && tenantId) {
      logger.error('Guest users cannot be associated with a tenant')
      throw new Error('Guest users cannot be associated with a tenant', { cause: StatusCodes.BAD_REQUEST })
    }

    if (role !== 'guest' && !tenantId) {
      logger.error('Tenant ID is required for non-guest roles')
      throw new Error('Tenant ID is required', { cause: StatusCodes.BAD_REQUEST })
    }

    if (tenantId) {
      const tenant = await Tenant.findById(tenantId)
      if (!tenant) {
        logger.error(`Invalid tenant ID: ${tenantId}`)
        throw new Error('Invalid tenant ID', { cause: StatusCodes.BAD_REQUEST })
      }
    }

  const strength = assessPasswordStrength(password)
  if (strength.score < MIN_PASSWORD_SCORE) {
    logger.error(`Weak password for signup: ${email}, score: ${strength.score}`)
    throw new Error(`Password is too weak. ${strength.feedback.warning}. Suggestions: ${strength.feedback.suggestions.join(' ')}`, { cause: StatusCodes.BAD_REQUEST })
  }
  
  const existingUser = await User.findOne({ email })
  if (existingUser) {
    logger.error(`User with email ${email} already exists`)
    throw new Error(`User with email ${email} already exists`, { cause: StatusCodes.CONFLICT })
  }

  /*
  const tenant = await Tenant.findById(tenantId)
  if (!tenant) {
    throw new Error('Invalid tenant ID', { cause: StatusCodes.BAD_REQUEST })
  }
  */

  const user = new User({ 
    email,
    password,
    role: role || 'guest',
    tenant: tenantId,
    club: clubId
 })

  await user.save()
  logger.info(`User created: ${email} with role ${role}`)
  return user
} catch (error: any) {
  logger.error(`Signup error: ${error.message}`)
  throw error
}
}

export const login = async (email: string, password: string): Promise<ILoginResponse> => {
  try {
    logger.info(`Login request body: ${JSON.stringify({ email, password: '****' }, null, 2)}`)
  const user: IUser | null = await User.findOne({ email })
  if (!user || !(await user.comparePassword(password))) {
    throw new Error('Invalid email or password', { cause: StatusCodes.UNAUTHORIZED })
  }
  const signOptions: jwt.SignOptions = { expiresIn: config.jwtExpiresIn }
  const accessToken = jwt.sign(
    { id: user._id, role: user.role, tenantId: user.tenant?.toString() },
    config.jwtSecret,
    signOptions
  )
  const refreshSignOptions: jwt.SignOptions = { expiresIn: '7d' }
  const refreshToken = jwt.sign(
    { id: user._id },
    config.jwtRefreshSecret,
    refreshSignOptions
  )
  user.refreshTokens.push({ token: refreshToken, createdAt: new Date() })
  await user.save()

  logger.info(`User logged in: ${email}`)
  return {
    accessToken,
    refreshToken,
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      tenant: user.tenant,
      twoFactorEnabled: user.twoFactorEnabled
    }
  }
} catch (error: any) {
  logger.error(`Login error: ${error.message}`)
  throw error
}
}

export const changePassword = async (userId: string, oldPassword: string, newPassword: string): Promise<void> => {
  const user = await User.findById(userId)
  if (!user) {
    throw new Error('User not found', { cause: StatusCodes.NOT_FOUND })
  }

  const isMatch = await user.comparePassword(oldPassword)
  if (!isMatch) {
    throw new Error('Old password is incorrect', { cause: StatusCodes.UNAUTHORIZED })
  }

  const strength = assessPasswordStrength(newPassword)
  if (strength.score < MIN_PASSWORD_SCORE) {
    throw new Error(`New password is too weak (score: ${strength.score}/4). ${strength.feedback.warning}. Suggestions: ${strength.feedback.suggestions.join(' ')}`, { cause: StatusCodes.BAD_REQUEST })
  }

  user.password = newPassword
  await user.save()
}

export const refreshToken = async (token: string): Promise<ILoginResponse> => {
  if (!token) {
    throw new Error('Refresh token required', { cause: StatusCodes.BAD_REQUEST })
  }

  try {
    const payload = jwt.verify(token, config.jwtRefreshSecret)
    if (typeof payload === 'string' || !payload.id) {
      throw new Error('Invalid refresh token', { cause: StatusCodes.UNAUTHORIZED })
    }
    const user = await User.findById(payload.id)

    if (!user) {
      throw new Error('Invalid refresh token', { cause: StatusCodes.UNAUTHORIZED })
    }

    const tokenExists = user.refreshTokens.some((rt: IRefreshToken) => rt.token === token)
    if (!tokenExists) {
      throw new Error('Invalid refresh token', { cause: StatusCodes.UNAUTHORIZED })
    }

    user.refreshTokens.pull({ token })
    const signOptions: jwt.SignOptions = { expiresIn: config.jwtExpiresIn }
    const accessToken = jwt.sign(
      { id: user._id, role: user.role, tenantId: user.tenant?.toString() },
      config.jwtSecret,
      signOptions
    )
    const refreshSignOptions: jwt.SignOptions = { expiresIn: '7d' }
    const refreshToken = jwt.sign(
      { id: user._id },
      config.jwtRefreshSecret,
      refreshSignOptions
    )

    user.refreshTokens.push({ token: refreshToken, createdAt: new Date() })
    await user.save()

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        email: user.email,
        role: user.role,
        tenant: user.tenant,
        twoFactorEnabled: user.twoFactorEnabled
      }
    }
  } catch (error) {
    throw new Error('Invalid refresh token', { cause: StatusCodes.UNAUTHORIZED })
  }
}

export const enable2FA = async (userId: string): Promise<string> => {
  const user: IUser | null = await User.findById(userId)
  if (!user) {
    throw new Error('User not found', { cause: StatusCodes.NOT_FOUND })
  }
  if (user.twoFactorEnabled) {
    throw new Error('2FA already enabled', { cause: StatusCodes.BAD_REQUEST })
  }
  const secret = generateTOTPSecret()
  user.twoFactorSecret = secret
  user.twoFactorEnabled = true
  await user.save()
  return secret
}

export const verify2FA = async (userId: string, token: string): Promise<boolean> => {
  const user: IUser | null = await User.findById(userId)
  if (!user || !user.twoFactorSecret) {
    throw new Error('2FA not enabled for this user', { cause: StatusCodes.BAD_REQUEST })
  }
  const expectedToken = await generateTOTPToken(user.twoFactorSecret)
  if (token !== expectedToken) {
    throw new Error('Invalid 2FA token', { cause: StatusCodes.UNAUTHORIZED })
  }
  return true
}

export const disable2FA = async (userId: string): Promise<void> => {
  const user = await User.findById(userId)
  if (!user) {
    throw new Error('User not found', { cause: StatusCodes.NOT_FOUND })
  }
  user.twoFactorEnabled = false
  user.twoFactorSecret = undefined
  await user.save()
}
