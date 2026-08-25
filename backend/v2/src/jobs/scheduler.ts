import { billingQueue, analyticsQueue } from '@/jobs/queues'
import { query } from '@/db/pool'
import { logger } from '@/utils/logger'

// =============================================================================
// Scheduler
// Registers recurring cron jobs via BullMQ's built-in repeat feature.
// Called once at server startup — BullMQ deduplicates by job name so
// restarting the server does not create duplicate schedules.
// =============================================================================

export async function startScheduler(): Promise<void> {

  // ── Daily analytics snapshot — runs at 01:00 UTC for all active gyms ────────
  await analyticsQueue.add(
    'analytics.snapshot',
    { gymId: 'CRON_TRIGGER', date: '' }, // placeholder — processor fetches all gyms
    {
      repeat:      { pattern: '0 1 * * *' }, // 01:00 UTC daily
      jobId:       'daily-analytics-snapshot',
      removeOnComplete: { count: 7 },
    }
  )

  // ── Subscription expiry check — runs hourly ──────────────────────────────────
  await billingQueue.add(
    'billing.expire',
    { gymId: 'CRON_TRIGGER', subscriptionId: '', memberId: '' },
    {
      repeat:      { pattern: '0 * * * *' }, // top of every hour
      jobId:       'subscription-expiry-check',
      removeOnComplete: { count: 24 },
    }
  )

  // ── Freeze end check — runs daily at 00:05 UTC ───────────────────────────────
  await billingQueue.add(
    'billing.freeze.end',
    { gymId: 'CRON_TRIGGER', subscriptionId: '' },
    {
      repeat:      { pattern: '5 0 * * *' },
      jobId:       'freeze-end-check',
      removeOnComplete: { count: 7 },
    }
  )

  logger.info('Scheduler started — cron jobs registered')
}

// =============================================================================
// Called by the CRON_TRIGGER jobs above to fan out to individual gym jobs.
// Each cron job fires once, this function creates one job per affected gym.
// =============================================================================

export async function fanOutAnalyticsSnapshot(): Promise<void> {
  const today  = new Date().toISOString().split('T')[0]
  const gyms   = await query<{ id: string }>(
    `SELECT id FROM gyms WHERE subscription_status != 'cancelled'`
  )
  for (const gym of gyms.rows) {
    await analyticsQueue.add(
      'analytics.snapshot',
      { gymId: gym.id, date: today },
      { jobId: `snapshot_${gym.id}_${today}` } // deduplication key
    )
  }
  logger.info('Analytics snapshot jobs queued', { count: gyms.rows.length, date: today })
}

export async function fanOutExpiryCheck(): Promise<void> {
  // Find subscriptions expiring today or already expired but not yet marked
  const subs = await query<{ id: string; gym_id: string; member_id: string }>(
    `SELECT id, gym_id, member_id FROM member_subscriptions
     WHERE  status = 'active'
       AND  end_date IS NOT NULL
       AND  end_date <= CURRENT_DATE`
  )
  for (const sub of subs.rows) {
    await billingQueue.add(
      'billing.expire',
      { gymId: sub.gym_id, subscriptionId: sub.id, memberId: sub.member_id },
      { jobId: `expire_${sub.id}` }
    )
  }
  logger.info('Expiry check jobs queued', { count: subs.rows.length })
}

export async function fanOutFreezeEndCheck(): Promise<void> {
  const subs = await query<{ id: string; gym_id: string }>(
    `SELECT id, gym_id FROM member_subscriptions
     WHERE  status = 'frozen' AND frozen_until <= CURRENT_DATE`
  )
  for (const sub of subs.rows) {
    await billingQueue.add(
      'billing.freeze.end',
      { gymId: sub.gym_id, subscriptionId: sub.id },
      { jobId: `freeze_end_${sub.id}` }
    )
  }
  logger.info('Freeze-end jobs queued', { count: subs.rows.length })
}