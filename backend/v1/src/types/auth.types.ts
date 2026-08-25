import { Document, Types } from 'mongoose'
import { IUserBasic, IAddress } from './user.types'

export interface IRefreshToken {
  token: string
  createdAt: Date
}

export interface ILoginResponse {
  accessToken: string
  refreshToken: string
  user?: {
    id: string
    email: string
    role: string
    tenant?: Types.ObjectId
    twoFactorEnabled: boolean
  }
}

export type UserRole = 'guest' | 'front_desk' | 'manager' | 'admin' | 'tenant_admin' | 'SYSTEM_ADMIN'

export interface IUser extends Document {
  _id: Types.ObjectId
  tenant?: Types.ObjectId
  email: string
  password: string
  firstName?: string
  lastName?: string
  phoneNumber?: string
  basicInformation: IUserBasic
  address?: IAddress
  role: UserRole
  qrCodeId?: string
  employeeId?: string
  department?: string
  refreshTokens: Types.Array<IRefreshToken>
  twoFactorEnabled: boolean
  twoFactorSecret?: string
  checkInTime?: Date
  checkOutTime?: Date
  createdAt: Date
  updatedAt: Date
  comparePassword: (candidatePassword: string) => Promise<boolean>
}
