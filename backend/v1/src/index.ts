import express, { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import swaggerUi from 'swagger-ui-express'
import { swaggerSpec } from './config/swagger'
import clubRoutes from './routes/club.routes'
import authRoutes from './routes/auth.routes'
import logger from './config/logger'
import cors from 'cors'
//import { $ } from '@faker-js/faker/dist/airplane-CLphikKp'
import { StatusCodes } from 'http-status-codes'
import { ValidationError } from "joi";

dotenv.config()

const app = express()

app.use(cors())
app.use(express.json())
//app.use(express.static('src/public'))
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec))
app.use('/api/auth', authRoutes)
app.use('/api', clubRoutes)

/**

app.use((err: any, req:express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error(`Unhandled error: ${err.message}, Path: ${req.path}, Method: ${req.method}, Body: ${JSON.stringify(req.body)}`)

    if (err instanceof ValidationError) {
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: 'Validation error',
            details: err.details.map(detail => detail.message)
        })
    }

    if (err.name === 'ClubServiceError') {
        return res.status(err.statusCode || StatusCodes.BAD_REQUEST).json({
            message: err.message || 'Guest service error'
        })
    }

    const status = err.status || StatusCodes.INTERNAL_SERVER_ERROR
    const message = err.message || 'Internal Server Error'
    res.status(status).json({ message })
})

 */


const PORT = process.env.PORT || 5000
mongoose.connect(process.env.MONGODB_URI as string).then(() => {
    app.listen(PORT, () => logger.info(`Server running on port ${PORT}`))
    }).catch((err) => logger.error('MongoDB connection error:', err))

export default app
