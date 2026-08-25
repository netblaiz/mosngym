// backend/v3/config/database.ts
import mongoose from 'mongoose'
import { config } from './env'
import logger from './logger'

export const connectDB = async (): Promise<void> => {
  try {
    await mongoose.connect(config.mongoUri, {
      autoIndex: config.nodeEnv !== 'production'
    })
    logger.info('MongoDB connected successfully')
  } catch (error) {
    logger.error('MongoDB connection error:', error)
    process.exit(1)
  }
}
