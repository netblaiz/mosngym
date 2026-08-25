import { Document, Types } from 'mongoose'

export interface IMember extends Document {
    id: string
    tenant: Types.ObjectId

    personalDetails: {
    avatar: string
    firstName: string
    lastName: string
    email: string
    phone: string
    dateOfBirth: Date
    }

    address: {
    location: string
    street: string
    suburb: string
    city: string
    postalCode: string
    }

    membershipInfo: {
    trainer: Types.ObjectId
    token: string
    club: Types.ObjectId
    note: string
    tag: string
    }

    emergencyContact: {
    name: string
    relationship: string
    phone: string
    }

    status: 'active' | 'deleted' | 'suspended'
}