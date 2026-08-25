import { startBillingWorker }      from './workers/billing.worker'
import { startNotificationWorker } from './workers/notification.worker'
import { startAutomationWorker }   from './workers/automation.worker'
import { startAnalyticsWorker }    from './workers/analytics.worker'
import { startScheduler }          from './scheduler'
import { logger }                  from '@/utils/logger'

export async function startJobWorkers(): Promise<void> {
  startBillingWorker()
  startNotificationWorker()
  startAutomationWorker()
  startAnalyticsWorker()
  await startScheduler()
  logger.info('All job workers started')
}