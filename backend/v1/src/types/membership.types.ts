import { Document, Types } from 'mongoose'

export interface IMembership extends Document {
    id: string
    tenant: Types.ObjectId
    club: Types.ObjectId
    title: string
    description: string
    defaultCurrency: string
    price: number
    isFree: boolean
    status: 'active' | 'deleted' | 'suspended'
}