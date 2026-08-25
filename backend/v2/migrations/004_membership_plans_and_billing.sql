-- =============================================================================
-- Migration 004: Membership Plans & Subscriptions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- MEMBERSHIP_PLANS (plan templates defined by the gym owner)
-- ---------------------------------------------------------------------------
CREATE TABLE membership_plans (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name                TEXT          NOT NULL,
  description         TEXT,
  price               NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  billing_cycle       TEXT          NOT NULL
                        CHECK (billing_cycle IN ('weekly','monthly','quarterly','yearly','one_time','drop_in')),
  duration_days       INT,          -- NULL = open-ended (recurring until cancelled)
  class_credits       INT,          -- NULL = unlimited; 0 = no class access
  access_all_locations BOOLEAN      NOT NULL DEFAULT TRUE,
  access_location_ids  UUID[],      -- populated when access_all_locations = FALSE
  is_public           BOOLEAN       NOT NULL DEFAULT TRUE,  -- shown on widget/signup page
  sort_order          INT           NOT NULL DEFAULT 0,
  stripe_price_id     TEXT,         -- Stripe Price object for recurring billing
  stripe_product_id   TEXT,

  -- soft delete (preserve for historical subs)
  archived_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER membership_plans_updated_at
  BEFORE UPDATE ON membership_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER membership_plans_immutable_gym_id
  BEFORE UPDATE ON membership_plans
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX membership_plans_gym_id_idx         ON membership_plans (gym_id);
CREATE INDEX membership_plans_gym_id_active_idx  ON membership_plans (gym_id) WHERE archived_at IS NULL;

ALTER TABLE membership_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_plans_gym_isolation ON membership_plans
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- MEMBER_SUBSCRIPTIONS (a member's active or historical plan assignment)
-- ---------------------------------------------------------------------------
CREATE TABLE member_subscriptions (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id             UUID          NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id               UUID          NOT NULL REFERENCES membership_plans(id) ON DELETE RESTRICT,

  status                TEXT          NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','frozen','past_due','cancelled','expired')),

  -- billing dates
  start_date            DATE          NOT NULL,
  end_date              DATE,         -- NULL = open-ended recurring
  next_billing_date     DATE,
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  cancel_at_period_end  BOOLEAN       NOT NULL DEFAULT FALSE,

  -- freeze period
  frozen_from           DATE,
  frozen_until          DATE,

  -- credits (for credit-based plans)
  credits_total         INT,          -- set from plan at time of purchase; NULL = unlimited
  credits_remaining     INT,

  -- price at time of purchase (denormalized — plan price can change)
  price_paid            NUMERIC(10,2) NOT NULL,
  currency              CHAR(3)       NOT NULL DEFAULT 'USD',

  -- Stripe IDs
  stripe_subscription_id TEXT,
  stripe_customer_id     TEXT,

  auto_renew            BOOLEAN       NOT NULL DEFAULT TRUE,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT credits_remaining_lte_total
    CHECK (credits_remaining IS NULL OR credits_total IS NULL OR credits_remaining <= credits_total),
  CONSTRAINT freeze_dates_valid
    CHECK (frozen_until IS NULL OR frozen_from IS NOT NULL),
  CONSTRAINT date_range_valid
    CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TRIGGER member_subscriptions_updated_at
  BEFORE UPDATE ON member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER member_subscriptions_immutable_gym_id
  BEFORE UPDATE ON member_subscriptions
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX member_subscriptions_gym_id_idx            ON member_subscriptions (gym_id);
CREATE INDEX member_subscriptions_gym_member_idx        ON member_subscriptions (gym_id, member_id);
CREATE INDEX member_subscriptions_gym_status_idx        ON member_subscriptions (gym_id, status);
CREATE INDEX member_subscriptions_gym_billing_date_idx  ON member_subscriptions (gym_id, next_billing_date)
  WHERE status = 'active';
CREATE INDEX member_subscriptions_stripe_sub_idx        ON member_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE member_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_subscriptions_gym_isolation ON member_subscriptions
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- PAYMENTS (every financial transaction, debit or credit)
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id           UUID          REFERENCES members(id) ON DELETE SET NULL,
  subscription_id     UUID          REFERENCES member_subscriptions(id) ON DELETE SET NULL,

  type                TEXT          NOT NULL
                        CHECK (type IN ('subscription','one_off','pos_sale','refund','adjustment')),
  status              TEXT          NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','succeeded','failed','refunded','partially_refunded')),

  amount              NUMERIC(10,2) NOT NULL,  -- always positive; type determines direction
  currency            CHAR(3)       NOT NULL DEFAULT 'USD',
  amount_refunded     NUMERIC(10,2) NOT NULL DEFAULT 0,

  payment_method      TEXT          CHECK (payment_method IN ('card','cash','bank_transfer','credit','other')),
  description         TEXT,

  -- Stripe
  stripe_payment_intent_id  TEXT,
  stripe_charge_id          TEXT,
  stripe_invoice_id         TEXT,

  -- idempotency
  idempotency_key     TEXT,

  failure_reason      TEXT,
  metadata            JSONB,
  processed_by_id     UUID          REFERENCES staff(id) ON DELETE SET NULL,

  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT payments_refunded_lte_amount CHECK (amount_refunded <= amount)
);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER payments_immutable_gym_id
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX payments_gym_id_idx              ON payments (gym_id);
CREATE INDEX payments_gym_member_idx          ON payments (gym_id, member_id);
CREATE INDEX payments_gym_status_idx          ON payments (gym_id, status);
CREATE INDEX payments_gym_paid_at_idx         ON payments (gym_id, paid_at);
CREATE UNIQUE INDEX payments_idempotency_uk   ON payments (gym_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX payments_stripe_pi_idx           ON payments (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payments_gym_isolation ON payments
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);
