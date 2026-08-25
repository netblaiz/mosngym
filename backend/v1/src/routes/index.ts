import express from 'express'
import clubRoutes from './club.routes'
import authRoutes from './auth.routes'


const router = express.Router()

router.use('/auth', authRoutes)
router.use('/', clubRoutes)


export default router




