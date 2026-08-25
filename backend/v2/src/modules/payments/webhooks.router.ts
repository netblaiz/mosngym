import { Router, Request, Response } from 'express'
import { query } from '@/db/pool'
import { buildProvider } from '@/services/payment'
import { handleNormalisedEvent } from '@/services/payment'
import { logger } from '@/utils/logger'
import { ProviderName } from '@/services/payment/provider.interface'

export const webhooksRouter = Router()

// =============================================================================
// POST /webhooks/:provider
// One endpoint handles all providers: /webhooks/stripe, /webhooks/paystack, /webhooks/flutterwave
// Raw body must be preserved — mounted BEFORE express.json() in server.ts
// =============================================================================

webhooksRouter.post('/:provider', async (req: Request, res: Response) => {
  const providerName = req.params.provider as ProviderName

  if (!['stripe', 'paystack', 'flutterwave'].includes(providerName)) {
    res.status(404).json({ error: 'Unknown provider' })
    return
  }

  // ── 1. Get provider credentials from the webhook secret header ──────────────
  // Each provider sends a signature/hash header we verify before processing
  const signatureHeader: Record<string, string> = {
    stripe:       'stripe-signature',
    paystack:     'x-paystack-signature',
    flutterwave:  'verif-hash',
  }
  const signature = req.headers[signatureHeader[providerName]] as string

  // Look up the webhook secret for this provider
  // For multi-gym setups, Paystack/Flutterwave send to a single URL
  // and we identify the gym from the event payload metadata
  const secretRow = await query<{ credentials: string }>(
    `SELECT credentials FROM integrations
     WHERE  provider = $1 AND status = 'connected'
     LIMIT  1`,
    [providerName]
  )

  // Fall back to platform env secret for Stripe
  const secret = secretRow.rows[0]
    ? JSON.parse(secretRow.rows[0].credentials).webhook_secret
    : process.env.STRIPE_WEBHOOK_SECRET ?? ''

  // ── 2. Build provider instance just for verification + normalisation ─────────
  const credRow = await query<{ credentials: string }>(
    `SELECT credentials FROM integrations WHERE provider = $1 AND status = 'connected' LIMIT 1`,
    [providerName]
  )
  const creds = credRow.rows[0]
    ? JSON.parse(credRow.rows[0].credentials)
    : { secret_key: process.env.STRIPE_SECRET_KEY ?? '' }

  const provider = buildProvider(providerName, creds.secret_key)

  // ── 3. Verify signature ──────────────────────────────────────────────────────
  const valid = provider.verifyWebhook({ rawBody: req.body, signature, secret })
  if (!valid) {
    logger.warn('Webhook signature invalid', { provider: providerName })
    res.status(400).json({ error: 'Invalid signature' })
    return
  }

  // ── 4. Parse the raw body ────────────────────────────────────────────────────
  let rawPayload: unknown
  try {
    rawPayload = JSON.parse(req.body.toString())
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' })
    return
  }

  // ── 5. Normalise event ───────────────────────────────────────────────────────
  const event = provider.normaliseEvent(rawPayload)

  if (!event) {
    // Unrecognised event type — acknowledge and skip
    res.json({ received: true })
    return
  }

  // ── 6. Idempotency check ─────────────────────────────────────────────────────
  const existing = await query<{ status: string }>(
    `SELECT status FROM webhook_events WHERE provider = $1 AND event_id = $2`,
    [providerName, event.eventId]
  )
  if (existing.rows[0]?.status === 'processed') {
    logger.debug('Duplicate webhook event, skipping', { provider: providerName, eventId: event.eventId })
    res.json({ received: true })
    return
  }

  // ── 7. Persist raw event ─────────────────────────────────────────────────────
  await query(`
    INSERT INTO webhook_events (provider, event_id, event_type, payload, status)
    VALUES ($1,$2,$3,$4,'received')
    ON CONFLICT (provider, event_id) DO NOTHING
  `, [providerName, event.eventId, event.eventType, JSON.stringify(rawPayload)])

  // ── 8. Handle ────────────────────────────────────────────────────────────────
  try {
    await handleNormalisedEvent(event)
    await query(
      `UPDATE webhook_events SET status = 'processed', processed_at = NOW()
       WHERE provider = $1 AND event_id = $2`,
      [providerName, event.eventId]
    )
  } catch (err: any) {
    logger.error('Webhook handler failed', {
      provider: providerName, eventId: event.eventId, error: err.message,
    })
    await query(
      `UPDATE webhook_events SET status = 'failed', error_message = $1
       WHERE provider = $2 AND event_id = $3`,
      [err.message, providerName, event.eventId]
    )
  }

  // Always 200 — never let providers retry a logic error
  res.json({ received: true })
})
