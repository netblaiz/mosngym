import mongoose, { Schema} from 'mongoose'
import { IClub } from '../types/club.types'

const clubSchema = new Schema<IClub>(
  {
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      required: true
    },
    logourl: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    brandName: {
      type: String,
      required: true,
      trim: true
    },
    companyName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String
    },
    slogan: {
      type: String
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    primaryEmail: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    secondaryEmail: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    billingEmail: {
      type: String,
      //required: true,
      unique: true,
      trim: true
    },
    phone: {
      type: Number,
      required: true,
      unique: true,
      trim: true
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now
    },
    appUrl: {
      type: String,
      required: true
    },
    location: {
      type: String,
      required: true
    },
    street: {
      type: String,
      required: true
    },
    suburb: {
      type: String
    },
    postalCode: {
      type: Number
    },
    status: {
      type: String,
      enum: ['active', 'deleted', 'suspended'],
      default: 'active'
    }

  },
  { timestamps: true }
)

export const Club = mongoose.model<IClub>('Club', clubSchema)
