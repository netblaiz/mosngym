import express from 'express'
import  AuthController  from '../controllers/auth.controller'
import { validateSignup, validateLogin, validateVerify2FA, validateRefreshToken } from '../validations/auth.validation'
import { authenticate, restrictToRoles } from '../middlewares/auth.middleware'
import { restrictToTenant } from '../middlewares/restrictToTenant.middleware'

const router = express.Router()

//router.post('/signup', validateSignup, AuthController.signup)
router.post('/signup', AuthController.signup)
router.post('/login', validateLogin, AuthController.login)
//router.post('/2fa/enable/:userId', authenticate, restrictToRoles('user', 'admin', 'tenant_admin', 'SYSTEM_ADMIN'), AuthController.enableTwoFactor)
router.post('/2fa/verify', authenticate, validateVerify2FA, AuthController.verifyTwoFactor)
//router.post('/2fa/disable/:userId', authenticate, restrictToRoles('user', 'admin', 'tenant_admin', 'SYSTEM_ADMIN'), AuthController.disableTwoFactor)
router.post('/refresh', validateRefreshToken, AuthController.refreshToken) 

export default router
