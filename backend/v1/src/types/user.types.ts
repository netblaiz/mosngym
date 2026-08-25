import { Document, Types } from 'mongoose'

export interface IUserBasic {
  firstName: string
  lastName: string
  middleName?: string
  phoneNumber: string
}

export interface IAddress {
    street: string
    city: string
    state: string
    country: string
    postalCode?: string
}