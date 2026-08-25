import express from 'express'
import ClubController from '../controllers/club.controller'
import { validateClubForm } from '../validations/club.validation'
import { authenticate, restrictToRoles } from '../middlewares/auth.middleware'
import { restrictToTenant } from '../middlewares/restrictToTenant.middleware'


const router = express.Router()

//router.use(authenticate)
//router.use(restrictToTenant)
//router.use(restrictToRoles)

router.post('/club', validateClubForm ,ClubController.createClub)

export default router