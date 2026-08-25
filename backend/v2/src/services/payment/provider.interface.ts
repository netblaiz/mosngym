// =============================================================================
// Payment Provider Interface
// Every payment provider (Stripe, Paystack, Flutterwave) implements this.
// The rest of the app only talks to this interface — never to a provider directly.
// =============================================================================

export interface PaymentProvider {
  readonly name: ProviderName
}

export type ProviderName = 'stripe' | 'paystack' | 'flutterwave'

// ─── Customer ─────────────────────────────────────────────────────────────────

export interface CreateCustomerInput {
  email:     string
  name?:     string
  phone?:    string
  metadata?: Record<string, string>
}

export interface Customer {
  providerId: string   // Stripe customer_id, Paystack customer_code etc.
  email:      string
}

// ─── Charge ───────────────────────────────────────────────────────────────────

export interface ChargeInput {
  customerId:      string         // provider's customer ID
  amount:          number         // in major currency unit (e.g. 100.00 not 10000)
  currency:        string         // ISO 4217 e.g. 'USD', 'NGN', 'GHS'
  description:     string
  paymentMethodId?: string        // saved card / authorization code
  receiptEmail?:   string
  metadata?:       Record<string, string>
  idempotencyKey:  string
}

export interface ChargeResult {
  providerId:    string           // Stripe payment_intent id, Paystack reference etc.
  status:        'succeeded' | 'pending' | 'failed'
  amount:        number
  currency:      string
  failureReason?: string
}

// ─── Refund ───────────────────────────────────────────────────────────────────

export interface RefundInput {
  chargeProviderId: string        // the original charge's provider ID
  amount?:          number        // omit for full refund
  reason?:          string
}

export interface RefundResult {
  providerId: string
  status:     'succeeded' | 'pending' | 'failed'
  amount:     number
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface CreateSubscriptionInput {
  customerId:      string
  planProviderId:  string         // Stripe price ID, Paystack plan_code etc.
  paymentMethodId: string
  metadata?:       Record<string, string>
  trialDays?:      number
}

export interface SubscriptionResult {
  providerId:    string
  status:        string
  currentPeriodEnd: Date
}

export interface CancelSubscriptionInput {
  subscriptionProviderId: string
  atPeriodEnd:            boolean
}

export interface PauseSubscriptionInput {
  subscriptionProviderId: string
}

// ─── Payment method / card setup ──────────────────────────────────────────────

export interface SetupPaymentMethodResult {
  // A client-facing secret the frontend uses to collect card details
  // Stripe: SetupIntent client_secret
  // Paystack: authorization_url (redirect flow)
  // Flutterwave: payment link
  clientSecret?:    string
  redirectUrl?:     string
  providerCustomerId: string
}

// ─── Plan (for recurring billing) ────────────────────────────────────────────

export interface CreatePlanInput {
  name:     string
  amount:   number
  currency: string
  interval: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  metadata?: Record<string, string>
}

export interface PlanResult {
  providerId: string   // Stripe price_id, Paystack plan_code etc.
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export interface WebhookVerifyInput {
  rawBody:   Buffer | string
  signature: string
  secret:    string
}

// Normalised event — provider differences are abstracted here
export interface NormalisedWebhookEvent {
  provider:       ProviderName
  eventId:        string
  eventType:      NormalisedEventType
  subscriptionId?: string          // provider subscription ID
  chargeId?:       string          // provider charge/payment_intent ID
  customerId?:     string
  amount?:         number
  currency?:       string
  failureReason?:  string
  periodEnd?:      Date
  raw:             unknown          // original provider payload
}

export type NormalisedEventType =
  | 'charge.succeeded'
  | 'charge.failed'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.cancelled'
  | 'subscription.updated'

// ─── The full interface ────────────────────────────────────────────────────────

export interface IPaymentProvider {
  readonly name: ProviderName

  // Customers
  createCustomer(input: CreateCustomerInput): Promise<Customer>
  findCustomer(email: string): Promise<Customer | null>

  // One-off charges
  charge(input: ChargeInput): Promise<ChargeResult>
  refund(input: RefundInput): Promise<RefundResult>

  // Card / payment method collection
  setupPaymentMethod(customerId: string, currency: string): Promise<SetupPaymentMethodResult>

  // Recurring plans
  createPlan(input: CreatePlanInput): Promise<PlanResult>
  createSubscription(input: CreateSubscriptionInput): Promise<SubscriptionResult>
  cancelSubscription(input: CancelSubscriptionInput): Promise<void>
  pauseSubscription(input: PauseSubscriptionInput): Promise<void>
  resumeSubscription(subscriptionProviderId: string): Promise<void>

  // Webhooks
  verifyWebhook(input: WebhookVerifyInput): boolean
  normaliseEvent(rawPayload: unknown): NormalisedWebhookEvent | null
}