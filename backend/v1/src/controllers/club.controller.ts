import { Request, Response } from 'express'
import { StatusCodes } from "http-status-codes"
import { Club } from '../models/club.model'

export default class ClubController {
    static async createClub(req: Request, res: Response) {
        const { tenant, logourl, brandName, companyName, description, slogan, owner, primaryEmail, secondaryEmail, billingEmail, phone, appUrl, location, street, suburb, city, postalCode } = req.body
        /*const club = new Club({ tenant, logourl, brandName, companyName, description, slogan, owner, primaryEmail, secondaryEmail, billingEmail, phone, appUrl, location, street, suburb, city, postalCode }) */
        const club = new Club( req.body )
        await club.save()
        return res.status(StatusCodes.CREATED).json(club)
    }
}