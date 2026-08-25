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

// Flutterwave REST API
// Docs: https://developer.flutterwave.com/docs

export class FlutterwaveProvider implements IPaymentProvider {
  readonly name: ProviderName = 'flutterwave'
  private readonly baseUrl = 'https://api.flutterwave.com/v3'

  constructor(private readonly secretKey: string) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization:  `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json() as { status: string; data: T; message: string }
    if (json.status !== 'success') throw new Error(`Flutterwave error: ${json.message}`)
    return json.data
  }

  // ── Customers ──────────────────────────────────────────────────────────────
  // Flutterwave does not have an explicit customer object —
  // customers are identified by email on each transaction

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    return { providerId: input.email, email: input.email }
  }

  async findCustomer(email: string): Promise<Customer | null> {
    return { providerId: email, email }
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async charge(input: ChargeInput): Promise<ChargeResult> {
    // Flutterwave supports tokenised card charges
    const data = await this.request<{
      id: number; status: string; amount: number; currency: string; flw_ref: string
    }>(
      'POST', '/charges?type=token',
      {
        token:      input.paymentMethodId, // Flutterwave card token
        email:      input.receiptEmail,
        amount:     input.amount,
        currency:   input.currency,
        tx_ref:     input.idempotencyKey,
        narration:  input.description,
      }
    )

    return {
      providerId: String(data.id),
      status:     data.status === 'successful' ? 'succeeded' : 'pending',
      amount:     data.amount,
      currency:   data.currency,
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const data = await this.request<{ id: number; status: string; amount_refunded: number }>(
      'POST', `/transactions/${input.chargeProviderId}/refund`,
      { amount: input.amount }
    )

    return {
      providerId: String(data.id),
      status:     data.status === 'completed' ? 'succeeded' : 'pending',
      amount:     data.amount_refunded,
    }
  }

  // ── Card setup (Flutterwave uses a hosted payment link) ────────────────────

  async setupPaymentMethod(customerId: string, currency: string): Promise<SetupPaymentMethodResult> {
    const data = await this.request<{ link: string }>(
      'POST', '/payments',
      {
        tx_ref:   `setup_${customerId}_${Date.now()}`,
        amount:   '0',
        currency,
        redirect_url: 'https://yourdomain.com/payment-callback', // configure per gym
        customer: { email: customerId },
        customizations: { title: 'Save payment method' },
      }
    )

    return {
      redirectUrl:        data.link,
      providerCustomerId: customerId,
    }
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async createPlan(input: CreatePlanInput): Promise<PlanResult> {
    const intervalMap: Record<string, string> = {
      weekly:    'weekly',
      monthly:   'monthly',
      quarterly: 'quarterly',
      yearly:    'yearly',
    }

    const data = await this.request<{ id: number }>(
      'POST', '/payment-plans',
      {
        amount:   input.amount,
        name:     input.name,
        interval: intervalMap[input.interval],
        currency: input.currency,
      }
    )

    return { providerId: String(data.id) }
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult> {
    // Flutterwave subscriptions are created by charging with a payment plan attached
    const data = await this.request<{
      id: number; status: string; next_attempt: string
    }>(
      'POST', '/charges?type=token',
      {
        token:       input.paymentMethodId,
        email:       input.customerId,
        amount:      0, // plan amount is used
        currency:    'NGN',
        tx_ref:      `sub_${input.customerId}_${Date.now()}`,
        payment_plan: input.planProviderId,
      }
    )

    return {
      providerId:       String(data.id),
      status:           data.status,
      currentPeriodEnd: new Date(data.next_attempt),
    }
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    await this.request('PUT', `/payment-plans/${input.subscriptionProviderId}`, {
      status: 'cancelled',
    })
  }

  async pauseSubscription(input: PauseSubscriptionInput): Promise<void> {
    await this.request('PUT', `/payment-plans/${input.subscriptionProviderId}`, {
      status: 'inactive',
    })
  }

  async resumeSubscription(subscriptionProviderId: string): Promise<void> {
    await this.request('PUT', `/payment-plans/${subscriptionProviderId}`, {
      status: 'active',
    })
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(input: WebhookVerifyInput): boolean {
    // Flutterwave uses a secret hash header, not HMAC
    return input.signature === input.secret
  }

  normaliseEvent(rawPayload: unknown): NormalisedWebhookEvent | null {
    const event = rawPayload as { event: string; data: any }

    const base = {
      provider: 'flutterwave' as ProviderName,
      eventId:  String(event.data?.id ?? Date.now()),
      raw:      event,
    }

    switch (event.event) {
      case 'charge.completed':
        return {
          ...base,
          eventType:  'charge.succeeded',
          chargeId:   String(event.data.id),
          customerId: event.data.customer?.email,
          amount:     event.data.amount,
          currency:   event.data.currency,
        }
      case 'subscription.cancelled':
        return {
          ...base,
          eventType:      'subscription.cancelled',
          subscriptionId: String(event.data.id),
        }
      default:
        return null
    }
  }
}