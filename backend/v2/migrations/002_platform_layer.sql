-- =============================================================================
-- Migration 002: Platform Layer — Gyms, Settings, Locations
-- =============================================================================
-- These tables have NO gym_id FK and sit above the tenancy boundary.
-- RLS is NOT applied here — only the super-admin role may query them freely.
-- Application code resolves gym context from the JWT then sets app.current_gym_id.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- USERS (auth identity — no gym_id, one account can belong to multiple gyms)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT        NOT NULL,
  password_hash     TEXT        NOT NULL,
  email_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  email_verify_token TEXT,
  password_reset_token TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_email_uk UNIQUE (email),
  CONSTRAINT users_email_format CHECK (email ~* '^[^@]+@[^@]+\.[^@]+$')
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- GYMS (tenant root — one row per gym business)
-- ---------------------------------------------------------------------------
CREATE TABLE gyms (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT        NOT NULL,
  slug                  TEXT        NOT NULL,             -- used in widget URL
  owner_user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  email                 TEXT,
  phone                 TEXT,
  website               TEXT,
  logo_url              TEXT,
  brand_color           CHAR(7),                          -- hex e.g. #FF5733
  timezone              TEXT        NOT NULL DEFAULT 'UTC',
  country               CHAR(2)     NOT NULL DEFAULT 'US',
  currency              CHAR(3)     NOT NULL DEFAULT 'USD',

  -- SaaS subscription (your platform billing this gym)
  subscription_plan     TEXT        NOT NULL DEFAULT 'trial'
                          CHECK (subscription_plan IN ('trial','starter','growth','enterprise')),
  subscription_status   TEXT        NOT NULL DEFAULT 'active'
                          CHECK (subscription_status IN ('active','past_due','suspended','cancelled')),
  trial_ends_at         TIMESTAMPTZ,
  stripe_customer_id    TEXT,                             -- your platform's Stripe customer for this gym

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gyms_slug_uk     UNIQUE (slug),
  CONSTRAINT gyms_slug_format CHECK (slug ~ '^[a-z0-9-]+$')
);

CREATE TRIGGER gyms_updated_at
  BEFORE UPDATE ON gyms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX gyms_owner_user_id_idx ON gyms (owner_user_id);
CREATE INDEX gyms_subscription_status_idx ON gyms (subscription_status);

-- ---------------------------------------------------------------------------
-- GYM_SETTINGS (one row per gym — all configurable knobs)
-- ---------------------------------------------------------------------------
CREATE TABLE gym_settings (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                  UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,

  -- booking rules
  booking_lead_time_hrs   INT         NOT NULL DEFAULT 1,
  booking_max_advance_days INT        NOT NULL DEFAULT 30,
  cancel_window_hrs       INT         NOT NULL DEFAULT 2,
  no_show_fee             NUMERIC(10,2) NOT NULL DEFAULT 0,
  allow_online_signup     BOOLEAN     NOT NULL DEFAULT TRUE,
  allow_guest_booking     BOOLEAN     NOT NULL DEFAULT FALSE,

  -- access control
  access_mode             TEXT        NOT NULL DEFAULT 'staffed'
                            CHECK (access_mode IN ('staffed','24_7','hybrid')),
  checkin_method          TEXT[]      NOT NULL DEFAULT '{qr}',  -- qr, ble, pin, fob

  -- integrations
  stripe_account_id       TEXT,                           -- gym's own Stripe Connect account
  twilio_number           TEXT,
  mailchimp_list_id       TEXT,
  sendgrid_sender_email   TEXT,

  -- member portal
  member_app_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  widget_enabled          BOOLEAN     NOT NULL DEFAULT TRUE,

  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gym_settings_gym_id_uk UNIQUE (gym_id)
);

CREATE TRIGGER gym_settings_updated_at
  BEFORE UPDATE ON gym_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- GYM_LOCATIONS (branches — one gym can have multiple locations)
-- ---------------------------------------------------------------------------
CREATE TABLE gym_locations (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  postcode      TEXT,
  country       CHAR(2),
  phone         TEXT,
  email         TEXT,
  is_primary    BOOLEAN     NOT NULL DEFAULT FALSE,
  open_hours    JSONB,
  -- e.g. {"mon":{"open":"06:00","close":"22:00"},"sat":{"open":"08:00","close":"18:00"}}
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT gym_locations_gym_id_fk FOREIGN KEY (gym_id) REFERENCES gyms(id)
);

CREATE TRIGGER gym_locations_updated_at
  BEFORE UPDATE ON gym_locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER gym_locations_immutable_gym_id
  BEFORE UPDATE ON gym_locations
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX gym_locations_gym_id_idx ON gym_locations (gym_id);

-- Ensure only one primary location per gym
CREATE UNIQUE INDEX gym_locations_primary_uk
  ON gym_locations (gym_id) WHERE is_primary = TRUE;
