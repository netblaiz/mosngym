import { Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import { signup, login, enable2FA, verify2FA, disable2FA, refreshToken } from '../services/auth.service'
import { ILoginResponse } from '../types/auth.types'

type RequestWithUser = Request & { user?: { role?: string } }

export default class AuthController {
  static async signup(req: Request, res: Response) {
    try {
      const { email, password, role, tenantId, clubId } = req.body
      console.log(`Signup request body: ${JSON.stringify(req.body, null, 2)}`)
      const user = await signup(email, password, role, tenantId, clubId)
      return res.status(StatusCodes.CREATED).json({ user })
    } catch (error: any) {
      console.error(`Signup error: ${error.message}`)
      const status = error.cause || StatusCodes.INTERNAL_SERVER_ERROR
      return res.status(status).json({ message: error.message })
    }
  }

  static async createSystemAdmin(req: RequestWithUser, res: Response) {
    if (req.user?.role !== 'SYSTEM_ADMIN') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Only SYSTEM_ADMIN can create admins' })
    } 
  }

  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body
      console.log(`Login request body: ${JSON.stringify(req.body, null, 2)}`)
      if (!email || !password) {
        throw new Error('Email and password are required', { cause: StatusCodes.BAD_REQUEST })
      }
      const response: ILoginResponse = await login(email, password)
      return res.status(StatusCodes.OK).json(response)
    } catch (error: any) {
      console.error(`Login error: ${error.message}`)
      const status = error.cause || StatusCodes.INTERNAL_SERVER_ERROR
      return res.status(status).json({ message: error.message })
    }
  }

  static async enableTwoFactor(req: Request, res: Response) {
    try {
      const { userId } = req.params
      console.log(`Enable 2FA request for userId: ${userId}`)
      const secret = await enable2FA(userId as string)
      return res.status(StatusCodes.OK).json({ secret })
    } catch (error: any) {
      console.error(`Enable 2FA error: ${error.message}`)
      const status = error.cause || StatusCodes.INTERNAL_SERVER_ERROR
      return res.status(status).json({ message: error.message })
    }
  }

  static async verifyTwoFactor(req: Request, res: Response) {
    try {
      const { userId, token } = req.body
      console.log(`Verify 2FA request body: ${JSON.stringify(req.body, null, 2)}`)
      const isValid = await verify2FA(userId, token)
      return res.status(StatusCodes.OK).json({ isValid })
    } catch (error: any) {
      console.error(`Verify 2FA error: ${error.message}`)
      const status = error.cause || StatusCodes.INTERNAL_SERVER_ERROR
      return res.status(status).json({ message: error.message })
    }
  }

  static async disableTwoFactor(req: Request, res: Response) {
    try {
      const { userId } = req.params
      console.log(`Disable 2FA request for userId: ${userId}`)
      await disable2FA(userId as string)
      return res.status(StatusCodes.OK).json({ message: '2FA disabled successfully' })
    } catch (error: any) {
      console.error(`Disable 2FA error: ${error.message}`)
      const status = error.cause || StatusCodes.INTERNAL_SERVER_ERROR
      return res.status(status).json({ message: error.message })
    }
  }

  static async refreshToken(req: Request, res: Response) {
    try {
      const { token } = req.body
      console.log(`Refresh token request body: ${JSON.stringify(req.body, null, 2)}`)
      const response: ILoginResponse = await refreshToken(token)
      return res.status(StatusCodes.OK).json(response)
    } catch (error: any) {
      console.error(`Refresh token error: ${error.message}`)
      const status = error.cause || StatusCodes.INTERNAL_SERVER_ERROR
      return res.status(status).json({ message: error.message })
    }
  }
}