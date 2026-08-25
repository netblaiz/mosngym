import mongoose, { Schema } from 'mongoose'
import { ITenant } from '../types/tenant.types'

const tenantSchema = new Schema<ITenant>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    isChain: {
      type: Boolean,
      default: false
    },
    subscriptions: [
      {
        service: {
          type: mongoose.Types.ObjectId,
          ref: 'Service'
        },
        subscribedAt: {
          type: Date,
          default: Date.now
        }
      }
    ]
  },
  { timestamps: true }
)

export const Tenant = mongoose.model<ITenant>('Tenant', tenantSchema)