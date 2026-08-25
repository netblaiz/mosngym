import { StringSchema } from 'joi'
import { Document, Types } from 'mongoose'

export interface IClub extends Document {
    id: string
    tenant: Types.ObjectId
    logourl: string
    brandName: string
    companyName: string
    description: string
    slogan: string
    owner: Types.ObjectId
    primaryEmail: string
    secondaryEmail: string
    billingEmail: string
    phone: number
    startDate: Date
    appUrl: string
    location: string
    street: string
    suburb: string
    city: string
    postalCode: number
    status: 'active' | 'deleted' | 'suspended'
}