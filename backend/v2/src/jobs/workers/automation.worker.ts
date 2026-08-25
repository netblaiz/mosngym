import { Worker, Job } from 'bullmq'
import { bullConnection } from '@/jobs/connection'
import { AutomationJobName, AutomationJobData, AutomationTriggerJob } from '@/jobs/types'
import { query } from '@/db/pool'
import { notificationQueue } from '@/jobs/queues'
import { logger } from '@/utils/logger'

// =============================================================================
// Automation worker
// Evaluates automation rules for a given trigger event and queues
// the appropriate notification jobs.
//
// Flow:
//   Event fires (e.g. member.created)
//     → automationQueue.add('automation.trigger', { gymId, event, resourceId })
//       → automation worker finds matching active rules for this gym + event
//         → for each rule, resolves template variables
//           → notificationQueue.add('notification.email' | 'sms' | 'push', ...)
// =============================================================================

export function startAutomationWorker() {
  const worker = new Worker<AutomationJobData, void, AutomationJobName>(
    'automations',
    async (job) => {
      if (job.name === 'automation.trigger') {
        return processTrigger(job as Job<AutomationTriggerJob>)
      }
    },
    {
      connection:  bullConnection,
      concurrency: 5,
    }
  )

  worker.on('failed', (job, err) =>
    logger.error('Automation job failed', { jobId: job?.id, error: err.message })
  )

  logger.info('Automation worker started')
  return worker
}

// =============================================================================
// processTrigger — finds matching rules and dispatches notifications
// =============================================================================

async function processTrigger(job: Job<AutomationTriggerJob>): Promise<void> {
  const { gymId, event, resourceId, payload } = job.data

  // Find all active rules for this gym + event
  const rulesRow = await query<{
    id: string; channel: string; delay_hours: number;
    custom_subject: string | null; custom_body: string | null;
    template_id: string | null
  }>(
    `SELECT id, channel, delay_hours, custom_subject, custom_body, template_id
     FROM   automation_rules
     WHERE  gym_id = $1 AND trigger_event = $2 AND is_active = TRUE`,
    [gymId, event]
  )

  if (!rulesRow.rows.length) return

  // Load the member record for variable resolution
  const memberId = payload.memberId as string | undefined
  let memberData: Record<string, string> = {}

  if (memberId) {
    const memberRow = await query<{
      first_name: string; last_name: string; email: string;
      phone: string | null; date_of_birth: string | null
    }>(
      `SELECT first_name, last_name, email, phone, date_of_birth
       FROM   members WHERE id = $1`,
      [memberId]
    )
    const m = memberRow.rows[0]
    if (m) {
      memberData = {
        'member.first_name':  m.first_name,
        'member.last_name':   m.last_name,
        'member.full_name':   `${m.first_name} ${m.last_name}`,
        'member.email':       m.email,
        'member.phone':       m.phone ?? '',
      }
    }
  }

  // Load gym info for variables
  const gymRow = await query<{ name: string; slug: string }>(
    `SELECT name, slug FROM gyms WHERE id = $1`, [gymId]
  )
  const gymData: Record<string, string> = {
    'gym.name': gymRow.rows[0]?.name ?? '',
    'gym.slug': gymRow.rows[0]?.slug ?? '',
  }

  const variables = { ...memberData, ...gymData, ...flattenPayload(payload) }

  for (const rule of rulesRow.rows) {

    // Load template if referenced
    let subject = rule.custom_subject ?? ''
    let body    = rule.custom_body    ?? ''

    if (rule.template_id) {
      const tplRow = await query<{ subject: string | null; body: string }>(
        `SELECT subject, body FROM communication_templates WHERE id = $1`,
        [rule.template_id]
      )
      if (tplRow.rows[0]) {
        subject = tplRow.rows[0].subject ?? subject
        body    = tplRow.rows[0].body
      }
    }

    // Resolve {{variable}} placeholders
    subject = interpolate(subject, variables)
    body    = interpolate(body, variables)

    const delayMs = rule.delay_hours * 60 * 60 * 1000

    // Dispatch the notification job (with optional delay)
    switch (rule.channel) {
      case 'email': {
        const email = variables['member.email']
        if (!email) break
        await notificationQueue.add(
          'notification.email',
          { gymId, to: email, subject, body, memberId },
          { delay: delayMs }
        )
        break
      }
      case 'sms': {
        const phone = variables['member.phone']
        if (!phone) break
        await notificationQueue.add(
          'notification.sms',
          { gymId, to: phone, body, memberId },
          { delay: delayMs }
        )
        break
      }
      case 'push': {
        if (!memberId) break
        await notificationQueue.add(
          'notification.push',
          { gymId, memberId, title: subject, body },
          { delay: delayMs }
        )
        break
      }
    }

    logger.info('Automation rule dispatched', {
      gymId, event, ruleId: rule.id, channel: rule.channel, delayHrs: rule.delay_hours,
    })
  }
}

// =============================================================================
// Helpers
// =============================================================================

// Replace {{key}} placeholders in a template string
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => vars[key.trim()] ?? `{{${key}}}`)
}

// Flatten a nested payload object into dot-notation keys
// e.g. { member: { id: '123' } } → { 'member.id': '123' }
function flattenPayload(
  obj:    Record<string, unknown>,
  prefix = ''
): Record<string, string> {
  return Object.entries(obj).reduce((acc, [k, v]) => {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(acc, flattenPayload(v as Record<string, unknown>, fullKey))
    } else {
      acc[fullKey] = String(v ?? '')
    }
    return acc
  }, {} as Record<string, string>)
}