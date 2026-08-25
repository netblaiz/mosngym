import { Worker, Job } from 'bullmq'
import { bullConnection } from '@/jobs/connection'
import {
  NotificationJobName, NotificationJobData,
  EmailJob, SmsJob, PushJob,
} from '@/jobs/types'
import { query } from '@/db/pool'
import { logger } from '@/utils/logger'

// =============================================================================
// Notification worker
// Handles: email (SendGrid), SMS (Twilio), push (Firebase FCM)
// Each send logs to the communications table for the audit trail
// =============================================================================

export function startNotificationWorker() {
  const worker = new Worker<NotificationJobData, void, NotificationJobName>(
    'notifications',
    async (job) => {
      switch (job.name) {
        case 'notification.email': return sendEmail(job as Job<EmailJob>)
        case 'notification.sms':   return sendSms(job as Job<SmsJob>)
        case 'notification.push':  return sendPush(job as Job<PushJob>)
      }
    },
    {
      connection:  bullConnection,
      concurrency: 10,  // notifications can be highly parallel
    }
  )

  worker.on('completed', (job) =>
    logger.info('Notification sent', { jobId: job.id, name: job.name })
  )
  worker.on('failed', (job, err) =>
    logger.error('Notification failed', { jobId: job?.id, name: job?.name, error: err.message })
  )

  logger.info('Notification worker started')
  return worker
}

// =============================================================================
// Email — SendGrid
// =============================================================================

async function sendEmail(job: Job<EmailJob>): Promise<void> {
  const { gymId, to, subject, body, memberId } = job.data

  // Get gym's SendGrid config (or fall back to platform key)
  const settingsRow = await query<{ sendgrid_sender_email: string | null }>(
    `SELECT sendgrid_sender_email FROM gym_settings WHERE gym_id = $1`, [gymId]
  )
  const fromEmail = settingsRow.rows[0]?.sendgrid_sender_email
    ?? process.env.SENDGRID_FROM_EMAIL
    ?? 'noreply@gymplatform.com'

  let providerId: string | null   = null
  let status:     string          = 'sent'
  let failReason: string | null   = null

  try {
    // Lazy import — SendGrid only loaded if actually used
    const sgMail = (await import('@sendgrid/mail')).default
    sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? '')

    const [response] = await sgMail.send({
      to, from: fromEmail, subject,
      html: body,
    })
    providerId = response.headers['x-message-id'] as string ?? null

  } catch (err: any) {
    status    = 'failed'
    failReason = err.message
    logger.error('SendGrid send failed', { to, error: err.message })
    throw err  // re-throw so BullMQ retries
  } finally {
    // Always log the attempt, even on failure
    if (gymId) {
      await query(`
        INSERT INTO communications
          (gym_id, member_id, channel, recipient, subject, body,
           status, provider_id, failure_reason, sent_at)
        VALUES ($1,$2,'email',$3,$4,$5,$6,$7,$8,$9)
      `, [gymId, memberId ?? null, to, subject, body,
          status, providerId, failReason,
          status === 'sent' ? new Date() : null])
    }
  }
}

// =============================================================================
// SMS — Twilio
// =============================================================================

async function sendSms(job: Job<SmsJob>): Promise<void> {
  const { gymId, to, body, memberId } = job.data

  const settingsRow = await query<{ twilio_number: string | null }>(
    `SELECT twilio_number FROM gym_settings WHERE gym_id = $1`, [gymId]
  )
  const fromNumber = settingsRow.rows[0]?.twilio_number
    ?? process.env.TWILIO_NUMBER

  if (!fromNumber) {
    logger.warn('No Twilio number configured', { gymId })
    return
  }

  let providerId: string | null = null
  let status:     string        = 'sent'
  let failReason: string | null = null

  try {
    const twilio = (await import('twilio')).default
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )

    const message = await client.messages.create({ to, from: fromNumber, body })
    providerId = message.sid

  } catch (err: any) {
    status     = 'failed'
    failReason = err.message
    logger.error('Twilio send failed', { to, error: err.message })
    throw err
  } finally {
    if (gymId) {
      await query(`
        INSERT INTO communications
          (gym_id, member_id, channel, recipient, body,
           status, provider_id, failure_reason, sent_at)
        VALUES ($1,$2,'sms',$3,$4,$5,$6,$7,$8)
      `, [gymId, memberId ?? null, to, body,
          status, providerId, failReason,
          status === 'sent' ? new Date() : null])
    }
  }
}

// =============================================================================
// Push — Firebase FCM
// =============================================================================

async function sendPush(job: Job<PushJob>): Promise<void> {
  const { gymId, memberId, title, body, data } = job.data

  // Load all device tokens for this member
  const tokensRow = await query<{ token: string; platform: string }>(
    `SELECT token, platform FROM push_tokens WHERE gym_id = $1 AND member_id = $2`,
    [gymId, memberId]
  )
  if (!tokensRow.rows.length) return

  try {
    const admin = (await import('firebase-admin')).default

    // Initialise Firebase app lazily (once)
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId:   process.env.FIREBASE_PROJECT_ID,
          privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
      })
    }

    const tokens = tokensRow.rows.map(r => r.token)

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data:         data ?? {},
    })

    // Remove tokens that are no longer valid
    const invalidTokens = response.responses
      .map((r: any, i: number) => ({ r, token: tokens[i] }))
      .filter(({ r }: { r: any; token: string}) => !r.success && r.error?.code === 'messaging/invalid-registration-token')
      .map(({ token }: { r: any; token: string }) => token)

    if (invalidTokens.length) {
      await query(
        `DELETE FROM push_tokens WHERE token = ANY($1)`, [invalidTokens]
      )
    }

    // Log one communication record for the push
    await query(`
      INSERT INTO communications
        (gym_id, member_id, channel, recipient, subject, body, status, sent_at)
      VALUES ($1,$2,'push',$3,$4,$5,'sent',NOW())
    `, [gymId, memberId, tokens.join(','), title, body])

  } catch (err: any) {
    logger.error('FCM send failed', { gymId, memberId, error: err.message })
    throw err
  }
}