import mongoose, { Schema } from 'mongoose'
import argon2 from 'argon2'
import { IUser, IRefreshToken } from '../types/auth.types'
import { IUserBasic, IAddress } from '../types/user.types'

const refreshTokenSchema = new Schema<IRefreshToken>({
  token: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now }
})

const IUserBasicSchema = new Schema<IUserBasic>({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  middleName: { type: String, required: false },
  phoneNumber: { type: String, required: true }
})

const IAddressSchema = new Schema<IAddress>({
  street: { type: String, required: true, maxLength: 200 },
  city: { type: String, required: true, maxLength: 200 },
  state: { type: String, required: true, maxLength: 200 },
  country: { type: String, required: true, maxLength: 50 },
  postalCode: { type: String, maxLength: 6}
})

const userSchema = new Schema<IUser>({
  tenant: { type: Schema.Types.ObjectId, ref: 'Tenant', required: function () { return this.role != 'guest' } },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  basicInformation: { type: IUserBasicSchema, required: true },
  address: { type: IAddressSchema, required: true },
  role: {
    type: String,
    enum: ['guest', 'front_desk', 'manager', 'admin', 'tenant_admin', 'SYSTEM_ADMIN'], required: true,
    default: 'guest' },
  qrCodeId: { type: String },
  employeeId: { type: String },
  department: { type: String },
  refreshTokens: [refreshTokenSchema],
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String },
  checkInTime: Date,
  checkOutTime: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true })

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    console.log(`Hashing password for user: ${this.email}`)
    if(!this.password) {
      console.error(`Password is undefined before hashing for user: ${this.email}`)
      throw new Error('Password cannot be defined', { cause: 500 })
    }
    this.password = await argon2.hash(this.password)
  }
  next
})

userSchema.methods.comparePassword = async function (password: string): Promise<boolean> {
  try {
    console.log(`Comparing password for user: ${this.email}, input: ${password}, stored: ${this.password}`)
    if (!password) {
      console.error(`Input password is undefined for user: ${this.email}`)
      return false
    }
    if (!this.password) {
      console.error(`Stored password is undefined for user: ${this.email}`)
      throw new Error('Stored password is missing', { cause: 500 })
    }
    const isMatch = await argon2.verify(this.password, password)
    console.log(`Password comparison result: ${isMatch}`)
    return isMatch
  } catch (error: any) {
    console.error(`Error comparing password: ${error.message}`)
    throw new Error('Invalid password comparison', { cause: 500 })
  }
}

export const User = mongoose.model<IUser>('User', userSchema)
