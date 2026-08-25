// =============================================================================
// Job payload types
// Every queue and every job name is strictly typed here.
// Nothing untyped passes through the queue boundary.
// =============================================================================

// ─── Billing queue ────────────────────────────────────────────────────────────

export type BillingJobName =
  | 'billing.charge'        // attempt a recurring charge
  | 'billing.retry'         // retry a failed payment (dunning step)
  | 'billing.expire'        // mark subscriptions whose end_date has passed
  | 'billing.freeze.end'    // auto-unfreeze when frozen_until date is reached

export interface BillingChargeJob {
  gymId:          string
  subscriptionId: string
  memberId:       string
  attempt:        number
}

export interface BillingRetryJob {
  gymId:          string
  paymentId:      string
  subscriptionId: string
  memberId:       string
  attempt:        number   // 1 = 3 days after failure, 2 = 7 days, 3 = 14 days (final)
}

export interface BillingExpireJob {
  gymId:          string
  subscriptionId: string
  memberId:       string
}

export interface BillingFreezeEndJob {
  gymId:          string
  subscriptionId: string
}

export type BillingJobData =
  | BillingChargeJob
  | BillingRetryJob
  | BillingExpireJob
  | BillingFreezeEndJob

// ─── Notification queue ───────────────────────────────────────────────────────

export type NotificationJobName =
  | 'notification.email'
  | 'notification.sms'
  | 'notification.push'

export interface EmailJob {
  gymId:     string
  to:        string
  subject:   string
  body:      string       // HTML
  memberId?: string
  replyTo?:  string
}

export interface SmsJob {
  gymId:     string
  to:        string        // E.164 phone number
  body:      string
  memberId?: string
}

export interface PushJob {
  gymId:     string
  memberId:  string
  title:     string
  body:      string
  data?:     Record<string, string>  // deep-link payload
}

export type NotificationJobData = EmailJob | SmsJob | PushJob

// ─── Automation queue ─────────────────────────────────────────────────────────

export type AutomationJobName =
  | 'automation.trigger'   // evaluate and fire an automation rule

export interface AutomationTriggerJob {
  gymId:       string
  event:       string      // e.g. 'member.created', 'payment.failed'
  resourceId:  string      // the ID of the entity that triggered the event
  payload:     Record<string, unknown>
}

export type AutomationJobData = AutomationTriggerJob

// ─── Analytics queue ──────────────────────────────────────────────────────────

export type AnalyticsJobName =
  | 'analytics.snapshot'   // compute and store daily KPI snapshot for a gym
  | 'analytics.export'     // generate CSV/XLSX export and email it

export interface AnalyticsSnapshotJob {
  gymId: string
  date:  string            // ISO date string e.g. '2025-01-15'
}

export interface AnalyticsExportJob {
  gymId:       string
  reportId:    string
  requestedBy: string      // staff ID
  emails:      string[]
}

export type AnalyticsJobData = AnalyticsSnapshotJob | AnalyticsExportJob