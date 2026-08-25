-- =============================================================================
-- Migration 009: Audit Logs & Integrations
-- =============================================================================

-- ---------------------------------------------------------------------------
-- AUDIT_LOGS (immutable change trail — no UPDATE or DELETE ever)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id        UUID        REFERENCES gyms(id) ON DELETE SET NULL,
  -- gym_id can be NULL for super-admin platform actions

  actor_id      UUID,       -- user/staff/device id — nullable (system events)
  actor_type    TEXT        NOT NULL
                  CHECK (actor_type IN ('member','staff','device','system','super_admin')),
  action        TEXT        NOT NULL,
  -- create | update | delete | login | logout | checkin | payment | export

  resource      TEXT        NOT NULL,   -- table name
  resource_id   UUID,
  diff          JSONB,                  -- {before:{}, after:{}} for updates
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs are append-only — block updates and deletes
CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX audit_logs_gym_id_idx        ON audit_logs (gym_id);
CREATE INDEX audit_logs_gym_created_idx   ON audit_logs (gym_id, created_at DESC);
CREATE INDEX audit_logs_gym_actor_idx     ON audit_logs (gym_id, actor_id);
CREATE INDEX audit_logs_gym_resource_idx  ON audit_logs (gym_id, resource, resource_id);

-- RLS: gym owners can only see their own audit logs; super-admin bypasses
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_gym_isolation ON audit_logs
  USING (
    gym_id IS NULL  -- super-admin / platform events
    OR gym_id = current_setting('app.current_gym_id', TRUE)::UUID
  );

-- ---------------------------------------------------------------------------
-- INTEGRATIONS (third-party credentials per gym)
-- ---------------------------------------------------------------------------
CREATE TABLE integrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  provider        TEXT        NOT NULL,
  -- stripe | twilio | mailchimp | sendgrid | zapier | google_calendar | custom

  status          TEXT        NOT NULL DEFAULT 'disconnected'
                    CHECK (status IN ('connected','disconnected','error')),

  -- encrypted in app layer before storage; never returned in API responses
  credentials     JSONB       NOT NULL DEFAULT '{}',
  -- {"api_key":"...", "account_id":"...", "webhook_secret":"..."}

  config          JSONB       NOT NULL DEFAULT '{}',
  -- provider-specific non-secret config
  -- e.g. {"from_name":"MyGym","reply_to":"info@mygym.com"}

  last_synced_at  TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT integrations_gym_provider_uk UNIQUE (gym_id, provider)
);

CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX integrations_gym_id_idx ON integrations (gym_id);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY integrations_gym_isolation ON integrations
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- API_KEYS (issued to gym owners for programmatic access)
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  created_by_id   UUID        REFERENCES staff(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  key_prefix      CHAR(8)     NOT NULL,   -- first 8 chars shown in UI e.g. "gm_live_"
  key_hash        TEXT        NOT NULL,   -- bcrypt hash — never store plaintext
  scopes          TEXT[]      NOT NULL DEFAULT '{}',
  -- e.g. '{members:read, bookings:read, checkins:write}'
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX api_keys_gym_id_idx    ON api_keys (gym_id);
CREATE INDEX api_keys_prefix_idx    ON api_keys (key_prefix);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_gym_isolation ON api_keys
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- WEBHOOK_EVENTS (inbound webhook log — idempotency guard)
-- ---------------------------------------------------------------------------
CREATE TABLE webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        REFERENCES gyms(id) ON DELETE SET NULL,
  provider        TEXT        NOT NULL,   -- 'stripe' | 'twilio' etc.
  event_id        TEXT        NOT NULL,   -- provider's event ID (Stripe evt_xxx)
  event_type      TEXT        NOT NULL,   -- 'invoice.payment_succeeded' etc.
  payload         JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received','processed','failed','ignored')),
  error_message   TEXT,
  processed_at    TIMESTAMPTZ,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT webhook_events_provider_event_uk UNIQUE (provider, event_id)
);

CREATE INDEX webhook_events_provider_idx     ON webhook_events (provider, event_id);
CREATE INDEX webhook_events_gym_status_idx   ON webhook_events (gym_id, status);
CREATE INDEX webhook_events_received_at_idx  ON webhook_events (received_at DESC);
-- Note: no RLS on webhook_events — processed by system, not by gym users
