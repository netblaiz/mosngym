import mongoose from 'mongoose'
import dotenv from 'dotenv'
import { Tenant } from '../models/tenant.model'

dotenv.config()

async function seedTenant() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/your_database')
  const tenant = new Tenant({ name: 'Benfit International Gym' })
  await tenant.save()
  console.log('Tenant created:', tenant._id)
  await mongoose.disconnect()
}

seedTenant().catch(console.error)