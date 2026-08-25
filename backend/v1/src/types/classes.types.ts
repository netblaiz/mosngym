import { Document, Types } from 'mongoose'

export interface IClassItem {
  uid: string
  startDate: Date
  endDate: Date
  beginTIme: Date
  endTime: Date
  dayOfWeek: string 
  trainers: Types.ObjectId[]
}

export interface IClasses extends Document {
    id: string
    club: Types.ObjectId
    name: string
    description: string
    maxParticipant: number
    color: string
    isCurrentMember: boolean
    isAllBenefit: boolean
    casuals: boolean
    basePrice: number
    timetable: Types.Array<IClassItem>
    isOnlineBooking: 'disable' | 'bookable' | 'hidden' | 'display'
    status: 'active' | 'deleted' | 'suspended'
}