import { query, withTransaction } from '@/db/pool'
import { cacheAside, key, TTL } from '@/db/redis'
import { logger } from '@/utils/logger'
import { IPaymentProvider, ProviderName, NormalisedWebhookEvent } from './provider.interface'
import { StripeProvider }      from './stripe.provider'
import { PaystackProvider }    from './paystack.provider'
import { FlutterwaveProvider } from './flutterwave.provider'
import { env } from '@/config/env'

// =============================================================================
// Provider factory
// Resolves the correct provider for a gym based on their integration settings.
// Credentials are stored encrypted in the integrations table.
// =============================================================================

export async function getProviderForGym(gymId: string): Promise<IPaymentProvider> {
  const cacheKey = key(gymId, 'payment:provider')

  const config = await cacheAside<{
    provider: ProviderName; secretKey: string; accountId?: string
  }>(cacheKey, TTL.LONG, async () => {
    const result = await query<{ provider: string; credentials: string }>(
      `SELECT provider, credentials
       FROM   integrations
       WHERE  gym_id = $1
         AND  provider IN ('stripe','paystack','flutterwave')
         AND  status = 'connected'
       ORDER  BY created_at ASC
       LIMIT  1`,
      [gymId]
    )

    if (!result.rows[0]) {
      // Fall back to platform-level Stripe if gym has no provider configured
      return {
        provider:  'stripe' as ProviderName,
        secretKey: env.STRIPE_SECRET_KEY,
      }
    }

    const credentials = JSON.parse(result.rows[0].credentials)
    return {
      provider:  result.rows[0].provider as ProviderName,
      secretKey: credentials.secret_key,
      accountId: credentials.account_id,
    }
  })

  return buildProvider(config.provider, config.secretKey, config.accountId)
}

// Build provider instance from config
export function buildProvider(
  name:      ProviderName,
  secretKey: string,
  accountId?: string
): IPaymentProvider {
  switch (name) {
    case 'stripe':
      return new StripeProvider(secretKey, accountId)
    case 'paystack':
      return new PaystackProvider(secretKey)
    case 'flutterwave':
      return new FlutterwaveProvider(secretKey)
    default:
      throw new Error(`Unknown payment provider: ${name}`)
  }
}

// =============================================================================
// Unified webhook handler
// Called by the webhook router — normalises the event regardless of provider,
// then runs the same business logic for all providers.
// =============================================================================

export async function handleNormalisedEvent(
  event: NormalisedWebhookEvent
): Promise<void> {
  logger.info('Handling normalised payment event', {
    provider:  event.provider,
    eventType: event.eventType,
    eventId:   event.eventId,
  })

  switch (event.eventType) {
    case 'subscription.renewed':
      return handleSubscriptionRenewed(event)
    case 'subscription.payment_failed':
      return handleSubscriptionPaymentFailed(event)
    case 'subscription.cancelled':
      return handleSubscriptionCancelled(event)
    case 'charge.succeeded':
      return handleChargeSucceeded(event)
    default:
      logger.debug('Unhandled normalised event type', { type: event.eventType })
  }
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

async function handleSubscriptionRenewed(event: NormalisedWebhookEvent): Promise<void> {
  if (!event.subscriptionId) return

  const subRow = await query<{ id: string; gym_id: string; member_id: string; credits_total: number | null }>(
    `SELECT id, gym_id, member_id, credits_total
     FROM   member_subscriptions
     WHERE  stripe_subscription_id = $1   -- reused column for all providers
     OR     (metadata->>'provider_sub_id' = $1)`,
    [event.subscriptionId]
  )
  const sub = subRow.rows[0]
  if (!sub) {
    logger.warn('subscription.renewed: subscription not found', { id: event.subscriptionId })
    return
  }

  const idempotency = `renewed_${event.provider}_${event.eventId}`

  await withTransaction(sub.gym_id, async (db) => {
    await db.query(`
      INSERT INTO payments
        (gym_id, member_id, subscription_id, type, status,
         amount, currency, payment_method, paid_at, idempotency_key)
      VALUES ($1,$2,$3,'subscription','succeeded',$4,$5,$6,NOW(),$7)
      ON CONFLICT (gym_id, idempotency_key) DO NOTHING
    `, [
      sub.gym_id, sub.member_id, sub.id,
      event.amount ?? 0,
      event.currency ?? 'USD',
      event.provider,
      idempotency,
    ])

    await db.query(`
      UPDATE member_subscriptions
      SET    status            = 'active',
             end_date          = $1,
             next_billing_date = $1,
             credits_remaining = credits_total,
             updated_at        = NOW()
      WHERE  id = $2
    `, [event.periodEnd ?? null, sub.id])

    await db.query(
      `UPDATE members SET status = 'active' WHERE id = $1 AND status = 'inactive'`,
      [sub.member_id]
    )
  })
}

async function handleSubscriptionPaymentFailed(event: NormalisedWebhookEvent): Promise<void> {
  if (!event.subscriptionId) return

  const subRow = await query<{ id: string; gym_id: string; member_id: string }>(
    `SELECT id, gym_id, member_id FROM member_subscriptions
     WHERE  stripe_subscription_id = $1
     OR     (metadata->>'provider_sub_id' = $1)`,
    [event.subscriptionId]
  )
  const sub = subRow.rows[0]
  if (!sub) return

  const idempotency = `failed_${event.provider}_${event.eventId}`

  await withTransaction(sub.gym_id, async (db) => {
    await db.query(`
      INSERT INTO payments
        (gym_id, member_id, subscription_id, type, status,
         amount, currency, payment_method, failure_reason, idempotency_key)
      VALUES ($1,$2,$3,'subscription','failed',$4,$5,$6,$7,$8)
      ON CONFLICT (gym_id, idempotency_key) DO NOTHING
    `, [
      sub.gym_id, sub.member_id, sub.id,
      event.amount ?? 0, event.currency ?? 'USD',
      event.provider, event.failureReason ?? 'Payment failed',
      idempotency,
    ])

    await db.query(
      `UPDATE member_subscriptions SET status = 'past_due' WHERE id = $1`,
      [sub.id]
    )
  })

  // TODO: emit payment.failed → dunning job
}

async function handleSubscriptionCancelled(event: NormalisedWebhookEvent): Promise<void> {
  if (!event.subscriptionId) return

  const subRow = await query<{ id: string; gym_id: string; member_id: string }>(
    `SELECT id, gym_id, member_id FROM member_subscriptions
     WHERE  stripe_subscription_id = $1
     OR     (metadata->>'provider_sub_id' = $1)`,
    [event.subscriptionId]
  )
  const sub = subRow.rows[0]
  if (!sub) return

  await withTransaction(sub.gym_id, async (db) => {
    await db.query(
      `UPDATE member_subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [sub.id]
    )
    const others = await db.one<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM member_subscriptions
       WHERE  member_id = $1 AND status = 'active'`,
      [sub.member_id]
    )
    if (parseInt(others?.count ?? '0') === 0) {
      await db.query(`UPDATE members SET status = 'inactive' WHERE id = $1`, [sub.member_id])
    }
  })
}

async function handleChargeSucceeded(event: NormalisedWebhookEvent): Promise<void> {
  if (!event.chargeId) return
  // Confirm any pending one-off payment recorded by the charge endpoint
  await query(
    `UPDATE payments SET status = 'succeeded', paid_at = NOW()
     WHERE  stripe_payment_id = $1 AND status = 'pending'`,
    [event.chargeId]
  )
}