import { Document } from 'mongoose'
import { IService } from './service.types'

export interface ITenant extends Document {
  name: string
  isChain: boolean
  subscriptions: { service: string | IService, subscribedAt: Date }[]
  createdAt: Date
  updatedAt: Date
}