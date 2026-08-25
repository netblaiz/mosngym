import crypto from 'crypto'
import {
  IPaymentProvider, ProviderName,
  CreateCustomerInput, Customer,
  ChargeInput, ChargeResult,
  RefundInput, RefundResult,
  SetupPaymentMethodResult,
  CreatePlanInput, PlanResult,
  CreateSubscriptionInput, SubscriptionResult,
  CancelSubscriptionInput, PauseSubscriptionInput,
  WebhookVerifyInput, NormalisedWebhookEvent,
} from './provider.interface'

// Paystack does not have an official Node SDK — we call the REST API directly.
// Docs: https://paystack.com/docs/api

export class PaystackProvider implements IPaymentProvider {
  readonly name: ProviderName = 'paystack'
  private readonly baseUrl = 'https://api.paystack.co'

  constructor(private readonly secretKey: string) {}

  private async request<T>(
    method: string,
    path:   string,
    body?:  unknown
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization:  `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json() as { status: boolean; data: T; message: string }
    if (!json.status) throw new Error(`Paystack error: ${json.message}`)
    return json.data
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const data = await this.request<{ customer_code: string; email: string }>(
      'POST', '/customer',
      { email: input.email, first_name: input.name, phone: input.phone }
    )
    return { providerId: data.customer_code, email: data.email }
  }

  async findCustomer(email: string): Promise<Customer | null> {
    try {
      const data = await this.request<{ customer_code: string; email: string }>(
        'GET', `/customer/${email}`
      )
      return { providerId: data.customer_code, email: data.email }
    } catch {
      return null
    }
  }

  // ── Charges ────────────────────────────────────────────────────────────────
  // Paystack charges in the smallest currency unit (kobo for NGN, pesewas for GHS)

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const amountMinor = Math.round(input.amount * 100)

    const data = await this.request<{
      reference: string; status: string; amount: number; currency: string
    }>(
      'POST', '/charge',
      {
        email:              input.receiptEmail,
        amount:             amountMinor,
        currency:           input.currency,
        authorization_code: input.paymentMethodId, // Paystack uses authorization codes
        reference:          input.idempotencyKey,
        metadata:           input.metadata,
      }
    )

    return {
      providerId: data.reference,
      status:     data.status === 'success' ? 'succeeded' : 'pending',
      amount:     data.amount / 100,
      currency:   data.currency,
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const data = await this.request<{ id: number; status: string; amount: number }>(
      'POST', '/refund',
      {
        transaction: input.chargeProviderId,
        amount:      input.amount ? Math.round(input.amount * 100) : undefined,
      }
    )

    return {
      providerId: String(data.id),
      status:     data.status === 'processed' ? 'succeeded' : 'pending',
      amount:     data.amount / 100,
    }
  }

  // ── Card setup (Paystack uses a redirect/authorization flow) ───────────────

  async setupPaymentMethod(customerId: string, currency: string): Promise<SetupPaymentMethodResult> {
    // Paystack collects card via a hosted page — we initialise a zero-amount
    // transaction that the customer completes to authorise their card.
    // The resulting authorization_code is the equivalent of Stripe's payment_method_id.
    const data = await this.request<{ authorization_url: string; reference: string }>(
      'POST', '/transaction/initialize',
      {
        email:    customerId,        // Paystack uses email as customer identifier
        amount:   50,                // Minimum charge in kobo (₦0.50) to verify card
        currency,
        channels: ['card'],
        metadata: { save_card: true },
      }
    )

    return {
      redirectUrl:        data.authorization_url,
      providerCustomerId: customerId,
    }
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async createPlan(input: CreatePlanInput): Promise<PlanResult> {
    const intervalMap: Record<string, string> = {
      weekly:    'weekly',
      monthly:   'monthly',
      quarterly: 'quarterly',
      yearly:    'annually',
    }

    const data = await this.request<{ plan_code: string }>(
      'POST', '/plan',
      {
        name:     input.name,
        amount:   Math.round(input.amount * 100),
        interval: intervalMap[input.interval],
        currency: input.currency,
      }
    )

    return { providerId: data.plan_code }
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult> {
    const data = await this.request<{
      subscription_code: string; status: string; next_payment_date: string
    }>(
      'POST', '/subscription',
      {
        customer:           input.customerId,
        plan:               input.planProviderId,
        authorization:      input.paymentMethodId,
        start_date:         new Date().toISOString(),
      }
    )

    return {
      providerId:       data.subscription_code,
      status:           data.status,
      currentPeriodEnd: new Date(data.next_payment_date),
    }
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    await this.request('POST', '/subscription/disable', {
      code:  input.subscriptionProviderId,
      token: '', // email token — in production fetch from subscription details
    })
  }

  // Paystack does not support pause natively — we cancel and recreate
  async pauseSubscription(_input: PauseSubscriptionInput): Promise<void> {
    throw new Error('Paystack does not support subscription pause. Cancel and recreate instead.')
  }

  async resumeSubscription(subscriptionProviderId: string): Promise<void> {
    await this.request('POST', '/subscription/enable', {
      code:  subscriptionProviderId,
      token: '',
    })
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(input: WebhookVerifyInput): boolean {
    const hash = crypto
      .createHmac('sha512', input.secret)
      .update(input.rawBody)
      .digest('hex')
    return hash === input.signature
  }

  normaliseEvent(rawPayload: unknown): NormalisedWebhookEvent | null {
    const event = rawPayload as { event: string; data: any }

    const base = {
      provider: 'paystack' as ProviderName,
      eventId:  event.data?.reference ?? event.data?.id ?? String(Date.now()),
      raw:      event,
    }

    switch (event.event) {
      case 'charge.success':
        return {
          ...base,
          eventType:  'charge.succeeded',
          chargeId:   event.data.reference,
          customerId: event.data.customer?.customer_code,
          amount:     event.data.amount / 100,
          currency:   event.data.currency,
        }
      case 'invoice.payment_failed':
        return {
          ...base,
          eventType:      'subscription.payment_failed',
          subscriptionId: event.data.subscription?.subscription_code,
          failureReason:  'Payment failed',
        }
      case 'subscription.create':
        return {
          ...base,
          eventType:      'subscription.renewed',
          subscriptionId: event.data.subscription_code,
          customerId:     event.data.customer?.customer_code,
          periodEnd:      new Date(event.data.next_payment_date),
        }
      case 'subscription.disable':
        return {
          ...base,
          eventType:      'subscription.cancelled',
          subscriptionId: event.data.subscription_code,
        }
      default:
        return null
    }
  }
}