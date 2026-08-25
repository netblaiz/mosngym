/**
 * @swagger
 * components:
 *   schemas:
 *     Club:
 *       type: object
 *       properties:
 *         tenant:
 *           type: string
 *         logourl:
 *           type: string
 *         brandName:
 *           type: string
 *         email:
 *         companyName:
 *           type: string
 *         description:
 *           type: string
 *         slogan:
 *           type: string
 *         owner:
 *           type: string
 *         primaryEmail:
 *           type: string
 *           format: email
 *         secondaryEmail:
 *           type: string
 *           format: email
 *         phone:
 *           type: string
 *         appUrl:
 *           type: string
 *         location: 
 *           type: string
 *         street:
 *           type: string 
 *         suburb:
 *           type: string
 *         city:
 *           type: string
 *         postalCode:
 *           type: string
 *
 * /api/club:
 *   post:
 *     summary: Create a new club
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Club'
 *     responses:
 *       201:
 *         description: Club created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Club'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *
 * /api/guest/{tenantId}/{guestId}:
 *   get:
 *     summary: Get a guest by ID
 *     tags: [Clubs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: path
 *         name: guestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guest ID
 *     responses:
 *       200:
 *         description: Guest details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Guest'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Guest not found
 *
 *   put:
 *     summary: Update a guest
 *     tags: [Guests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: path
 *         name: guestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guest ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Guest'
 *     responses:
 *       200:
 *         description: Guest updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Guest'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Guest not found
 *
 *   delete:
 *     summary: Delete a guest
 *     tags: [Guests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: path
 *         name: guestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guest ID
 *     responses:
 *       204:
 *         description: Guest deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Guest not found
 *
 * /api/guest/{tenantId}/{guestId}/check-in:
 *   post:
 *     summary: Check-in a guest
 *     tags: [Guests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: path
 *         name: guestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guest ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookingId:
 *                 type: string
 *             required:
 *               - bookingId
 *     responses:
 *       200:
 *         description: Check-in successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 guest:
 *                   $ref: '#/components/schemas/Guest'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Guest or booking not found
 *
 * /api/guest/{tenantId}/{guestId}/check-out:
 *   post:
 *     summary: Check-out a guest
 *     tags: [Guests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: path
 *         name: guestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Guest ID
 *     responses:
 *       200:
 *         description: Check-out successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 guest:
 *                   $ref: '#/components/schemas/Guest'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Guest not found
 *
 * /api/guest/{tenantId}/{bookingId}:
 *   get:
 *     summary: Retrieve a booking by ID and email
 *     tags: [Guests]
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         required: true
 *         schema:
 *           type: string
 *         description: Tenant ID
 *       - in: path
 *         name: bookingId
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Guest email
 *     responses:
 *       200:
 *         description: Booking details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Booking'
 *       400:
 *         description: Bad request
 *       404:
 *         description: Booking not found or email does not match
 */
export default {}
