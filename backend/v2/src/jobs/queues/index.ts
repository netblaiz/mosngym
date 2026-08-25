import { Queue } from 'bullmq'
import { bullConnection, criticalOpts, standardOpts, lowOpts } from '@/jobs/connection'
import {
  BillingJobName,    BillingJobData,
  NotificationJobName, NotificationJobData,
  AutomationJobName, AutomationJobData,
  AnalyticsJobName,  AnalyticsJobData,
} from '@/jobs/types'

// One Queue instance per logical group.
// Queues are lightweight — safe to instantiate at module load time.

export const billingQueue = new Queue<BillingJobData, void, BillingJobName>(
  'billing',
  { connection: bullConnection, defaultJobOptions: criticalOpts }
)

export const notificationQueue = new Queue<NotificationJobData, void, NotificationJobName>(
  'notifications',
  { connection: bullConnection, defaultJobOptions: standardOpts }
)

export const automationQueue = new Queue<AutomationJobData, void, AutomationJobName>(
  'automations',
  { connection: bullConnection, defaultJobOptions: standardOpts }
)

export const analyticsQueue = new Queue<AnalyticsJobData, void, AnalyticsJobName>(
  'analytics',
  { connection: bullConnection, defaultJobOptions: lowOpts }
)

// ─── Convenience helpers used throughout the app ──────────────────────────────

export { billingQueue as billing }
export { notificationQueue as notifications }
export { automationQueue as automations }
export { analyticsQueue as analytics }