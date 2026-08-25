import Stripe from 'stripe'
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

export class StripeProvider implements IPaymentProvider {
  readonly name: ProviderName = 'stripe'
  private client: Stripe

  constructor(secretKey: string, private readonly accountId?: string) {
    this.client = new Stripe(secretKey, { apiVersion: '2023-10-16' })
  }

  private get opts() {
    return this.accountId ? { stripeAccount: this.accountId } : undefined
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const customer = await this.client.customers.create({
      email:    input.email,
      name:     input.name,
      phone:    input.phone,
      metadata: input.metadata,
    }, this.opts)

    return { providerId: customer.id, email: customer.email! }
  }

  async findCustomer(email: string): Promise<Customer | null> {
    const list = await this.client.customers.list({ email, limit: 1 }, this.opts)
    const c    = list.data[0]
    return c ? { providerId: c.id, email: c.email! } : null
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async charge(input: ChargeInput): Promise<ChargeResult> {
    const intent = await this.client.paymentIntents.create({
      amount:               Math.round(input.amount * 100),
      currency:             input.currency.toLowerCase(),
      customer:             input.customerId,
      payment_method:       input.paymentMethodId,
      description:          input.description,
      confirm:              true,
      receipt_email:        input.receiptEmail,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata:             input.metadata,
    }, {
      ...this.opts,
      idempotencyKey: input.idempotencyKey,
    })

    return {
      providerId:    intent.id,
      status:        intent.status === 'succeeded' ? 'succeeded' : 'pending',
      amount:        intent.amount / 100,
      currency:      intent.currency.toUpperCase(),
    }
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    const refund = await this.client.refunds.create({
      payment_intent: input.chargeProviderId,
      amount:         input.amount ? Math.round(input.amount * 100) : undefined,
    }, this.opts)

    return {
      providerId: refund.id,
      status:     refund.status === 'succeeded' ? 'succeeded' : 'pending',
      amount:     refund.amount / 100,
    }
  }

  // ── Card setup ─────────────────────────────────────────────────────────────

  async setupPaymentMethod(customerId: string, _currency: string): Promise<SetupPaymentMethodResult> {
    const intent = await this.client.setupIntents.create({
      customer:             customerId,
      payment_method_types: ['card'],
    }, this.opts)

    return {
      clientSecret:       intent.client_secret ?? undefined,
      providerCustomerId: customerId,
    }
  }

  // ── Plans ──────────────────────────────────────────────────────────────────

  async createPlan(input: CreatePlanInput): Promise<PlanResult> {
    const intervalMap: Record<string, Stripe.PriceCreateParams.Recurring.Interval> = {
      weekly:    'week',
      monthly:   'month',
      quarterly: 'month',
      yearly:    'year',
    }

    const price = await this.client.prices.create({
      unit_amount:  Math.round(input.amount * 100),
      currency:     input.currency.toLowerCase(),
      recurring: {
        interval:       intervalMap[input.interval],
        interval_count: input.interval === 'quarterly' ? 3 : 1,
      },
      product_data: { name: input.name },
      metadata:     input.metadata,
    }, this.opts)

    return { providerId: price.id }
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult> {
    const sub = await this.client.subscriptions.create({
      customer:               input.customerId,
      items:                  [{ price: input.planProviderId }],
      default_payment_method: input.paymentMethodId,
      trial_period_days:      input.trialDays,
      metadata:               input.metadata,
    }, this.opts)

    return {
      providerId:       sub.id,
      status:           sub.status,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    }
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    if (input.atPeriodEnd) {
      await this.client.subscriptions.update(
        input.subscriptionProviderId,
        { cancel_at_period_end: true },
        this.opts
      )
    } else {
      await this.client.subscriptions.cancel(input.subscriptionProviderId, undefined, this.opts)
    }
  }

  async pauseSubscription(input: PauseSubscriptionInput): Promise<void> {
    await this.client.subscriptions.update(
      input.subscriptionProviderId,
      { pause_collection: { behavior: 'void' } },
      this.opts
    )
  }

  async resumeSubscription(subscriptionProviderId: string): Promise<void> {
    await this.client.subscriptions.update(
      subscriptionProviderId,
      { pause_collection: '' } as any,
      this.opts
    )
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(input: WebhookVerifyInput): boolean {
    try {
      this.client.webhooks.constructEvent(input.rawBody, input.signature, input.secret)
      return true
    } catch {
      return false
    }
  }

  normaliseEvent(rawPayload: unknown): NormalisedWebhookEvent | null {
    const event = rawPayload as Stripe.Event

    const base = {
      provider:  'stripe' as ProviderName,
      eventId:   event.id,
      raw:       event,
    }

    switch (event.type) {
      case 'invoice.paid': {
        const inv = event.data.object as Stripe.Invoice
        return {
          ...base,
          eventType:      'subscription.renewed',
          subscriptionId: inv.subscription as string,
          chargeId:       inv.payment_intent as string,
          customerId:     inv.customer as string,
          amount:         inv.amount_paid / 100,
          currency:       inv.currency.toUpperCase(),
          periodEnd:      new Date((inv.lines.data[0]?.period?.end ?? 0) * 1000),
        }
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        return {
          ...base,
          eventType:      'subscription.payment_failed',
          subscriptionId: inv.subscription as string,
          customerId:     inv.customer as string,
          amount:         inv.amount_due / 100,
          currency:       inv.currency.toUpperCase(),
          failureReason:  inv.last_finalization_error?.message ?? 'Payment failed',
        }
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        return { ...base, eventType: 'subscription.cancelled', subscriptionId: sub.id }
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        return { ...base, eventType: 'subscription.updated', subscriptionId: sub.id }
      }
      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent
        return {
          ...base,
          eventType:  'charge.succeeded',
          chargeId:   pi.id,
          amount:     pi.amount / 100,
          currency:   pi.currency.toUpperCase(),
        }
      }
      default:
        return null
    }
  }
}