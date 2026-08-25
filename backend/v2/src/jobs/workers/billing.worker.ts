import { Worker, Job } from 'bullmq'
import { bullConnection, criticalOpts } from '@/jobs/connection'
import {
  BillingJobName, BillingJobData,
  BillingChargeJob, BillingRetryJob,
  BillingExpireJob, BillingFreezeEndJob,
} from '@/jobs/types'
import { query, withTransaction } from '@/db/pool'
import { notificationQueue } from '@/jobs/queues'
import { getProviderForGym } from '@/services/payment'
import { logger } from '@/utils/logger'
import { v4 as uuid } from 'uuid'

// =============================================================================
// Billing worker
// Handles: charge, retry (dunning), expire, freeze-end
// =============================================================================

export function startBillingWorker() {
  const worker = new Worker<BillingJobData, void, BillingJobName>(
    'billing',
    async (job) => {
      switch (job.name) {
        case 'billing.charge':    return processCharge(job as Job<BillingChargeJob>)
        case 'billing.retry':     return processRetry(job as Job<BillingRetryJob>)
        case 'billing.expire':    return processExpire(job as Job<BillingExpireJob>)
        case 'billing.freeze.end': return processFreezeEnd(job as Job<BillingFreezeEndJob>)
      }
    },
    {
      connection:  bullConnection,
      concurrency: 5,   // process 5 billing jobs simultaneously
    }
  )

  worker.on('completed', (job) =>
    logger.info('Billing job completed', { jobId: job.id, name: job.name })
  )
  worker.on('failed', (job, err) =>
    logger.error('Billing job failed', { jobId: job?.id, name: job?.name, error: err.message })
  )

  logger.info('Billing worker started')
  return worker
}

// =============================================================================
// billing.charge — attempt a recurring subscription charge
// =============================================================================

async function processCharge(job: Job<BillingChargeJob>): Promise<void> {
  const { gymId, subscriptionId, memberId, attempt } = job.data

  // Load subscription + member email
  const subRow = await query<{
    id: string; price_paid: number; currency: string;
    stripe_subscription_id: string | null
  }>(
    `SELECT id, price_paid, currency, stripe_subscription_id
     FROM   member_subscriptions
     WHERE  id = $1 AND gym_id = $2 AND status = 'active'`,
    [subscriptionId, gymId]
  )
  const sub = subRow.rows[0]
  if (!sub) {
    logger.warn('billing.charge: subscription not found or inactive', { subscriptionId })
    return
  }

  const memberRow = await query<{ email: string }>(
    `SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
    [memberId]
  )
  const email = memberRow.rows[0]?.email
  if (!email) return

  const provider       = await getProviderForGym(gymId)
  const idempotencyKey = `recurring_${subscriptionId}_${attempt}_${uuid()}`

  try {
    const result = await provider.charge({
      customerId:     email,
      amount:         sub.price_paid,
      currency:       sub.currency,
      description:    'Membership renewal',
      idempotencyKey,
    })

    await withTransaction(gymId, async (db) => {
      await db.query(`
        INSERT INTO payments
          (gym_id, member_id, subscription_id, type, status,
           amount, currency, payment_method, paid_at, idempotency_key)
        VALUES ($1,$2,$3,'subscription','succeeded',$4,$5,$6,NOW(),$7)
        ON CONFLICT (gym_id, idempotency_key) DO NOTHING
      `, [gymId, memberId, subscriptionId,
          sub.price_paid, sub.currency, provider.name, idempotencyKey])

      await db.query(
        `UPDATE member_subscriptions
         SET status = 'active', credits_remaining = credits_total, updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId]
      )
    })

    logger.info('Recurring charge succeeded', { gymId, subscriptionId, amount: sub.price_paid })

  } catch (err: any) {
    logger.warn('Recurring charge failed', { gymId, subscriptionId, error: err.message })

    await withTransaction(gymId, async (db) => {
      await db.query(`
        INSERT INTO payments
          (gym_id, member_id, subscription_id, type, status,
           amount, currency, failure_reason, idempotency_key)
        VALUES ($1,$2,$3,'subscription','failed',$4,$5,$6,$7)
        ON CONFLICT (gym_id, idempotency_key) DO NOTHING
      `, [gymId, memberId, subscriptionId,
          sub.price_paid, sub.currency, err.message, idempotencyKey])

      await db.query(
        `UPDATE member_subscriptions SET status = 'past_due' WHERE id = $1`,
        [subscriptionId]
      )
    })

    // Kick off dunning — retry in 3 days
    await notificationQueue.add('notification.email', {
      gymId,
      to:       email,
      subject:  'Payment failed — action required',
      body:     `<p>We couldn't process your membership payment. Please update your payment method.</p>`,
      memberId,
    })
  }
}

// =============================================================================
// billing.retry — dunning steps after a failed payment
// Step 1: retry after 3 days
// Step 2: retry after 7 days
// Step 3: retry after 14 days — final warning, then cancel
// =============================================================================

async function processRetry(job: Job<BillingRetryJob>): Promise<void> {
  const { gymId, paymentId, subscriptionId, memberId, attempt } = job.data

  const subRow = await query<{
    id: string; price_paid: number; currency: string; status: string
  }>(
    `SELECT id, price_paid, currency, status
     FROM member_subscriptions WHERE id = $1`,
    [subscriptionId]
  )
  const sub = subRow.rows[0]

  // If already paid or cancelled by the time retry fires, skip
  if (!sub || sub.status === 'active' || sub.status === 'cancelled') return

  const memberRow = await query<{ email: string }>(
    `SELECT u.email FROM members m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
    [memberId]
  )
  const email = memberRow.rows[0]?.email
  if (!email) return

  const provider       = await getProviderForGym(gymId)
  const idempotencyKey = `retry_${paymentId}_attempt_${attempt}`

  try {
    await provider.charge({
      customerId:     email,
      amount:         sub.price_paid,
      currency:       sub.currency,
      description:    `Membership renewal (retry ${attempt})`,
      idempotencyKey,
    })

    await withTransaction(gymId, async (db) => {
      await db.query(`
        INSERT INTO payments
          (gym_id, member_id, subscription_id, type, status,
           amount, currency, payment_method, paid_at, idempotency_key)
        VALUES ($1,$2,$3,'subscription','succeeded',$4,$5,$6,NOW(),$7)
        ON CONFLICT (gym_id, idempotency_key) DO NOTHING
      `, [gymId, memberId, subscriptionId,
          sub.price_paid, sub.currency, provider.name, idempotencyKey])

      await db.query(
        `UPDATE member_subscriptions
         SET status = 'active', credits_remaining = credits_total, updated_at = NOW()
         WHERE id = $1`,
        [subscriptionId]
      )
    })

    logger.info('Dunning retry succeeded', { gymId, subscriptionId, attempt })

  } catch (err: any) {
    logger.warn('Dunning retry failed', { gymId, subscriptionId, attempt, error: err.message })

    if (attempt >= 3) {
      // Final attempt failed — cancel subscription
      await withTransaction(gymId, async (db) => {
        await db.query(
          `UPDATE member_subscriptions
           SET status = 'cancelled', cancelled_at = NOW(),
               cancellation_reason = 'Non-payment after 3 retry attempts'
           WHERE id = $1`,
          [subscriptionId]
        )
        await db.query(
          `UPDATE members SET status = 'inactive' WHERE id = $1`, [memberId]
        )
      })

      await notificationQueue.add('notification.email', {
        gymId,
        to:       email,
        subject:  'Your membership has been cancelled',
        body:     `<p>Your membership has been cancelled due to non-payment. Please contact us to reinstate.</p>`,
        memberId,
      })

      logger.info('Subscription cancelled after max dunning attempts', { gymId, subscriptionId })

    } else {
      // Schedule next retry: attempt 1 → 3 days, attempt 2 → 7 days
      const delayDays = attempt === 1 ? 3 : 7
      const delayMs   = delayDays * 24 * 60 * 60 * 1000

      const { billingQueue } = await import('@/jobs/queues')
      await billingQueue.add(
        'billing.retry',
        { gymId, paymentId, subscriptionId, memberId, attempt: attempt + 1 },
        { delay: delayMs }
      )
    }
  }
}

// =============================================================================
// billing.expire — mark a subscription whose end_date has passed
// =============================================================================

async function processExpire(job: Job<BillingExpireJob>): Promise<void> {
  const { gymId, subscriptionId, memberId } = job.data

   // Skip placeholder cron trigger jobs
  if (!subscriptionId || !gymId || gymId === 'CRON_TRIGGER') return


  await withTransaction(gymId, async (db) => {
    await db.query(
      `UPDATE member_subscriptions
       SET status = 'expired' WHERE id = $1 AND status = 'active'`,
      [subscriptionId]
    )
    const others = await db.one<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM member_subscriptions
       WHERE member_id = $1 AND status = 'active'`,
      [memberId]
    )
    if (parseInt(others?.count ?? '0') === 0) {
      await db.query(`UPDATE members SET status = 'inactive' WHERE id = $1`, [memberId])
    }
  })

  // TODO: emit subscription.expired → automation trigger
  logger.info('Subscription expired', { gymId, subscriptionId })
}

// =============================================================================
// billing.freeze.end — auto-unfreeze when frozen_until date is reached
// =============================================================================

async function processFreezeEnd(job: Job<BillingFreezeEndJob>): Promise<void> {
  const { gymId, subscriptionId } = job.data

  // Skip placeholder cron trigger jobs
  if (!subscriptionId || !gymId || gymId === 'CRON_TRIGGER') return

  await query(
    `UPDATE member_subscriptions
     SET status = 'active', frozen_from = NULL, frozen_until = NULL, updated_at = NOW()
     WHERE id = $1 AND status = 'frozen' AND frozen_until <= CURRENT_DATE`,
    [subscriptionId]
  )

  logger.info('Subscription unfrozen automatically', { gymId, subscriptionId })
}