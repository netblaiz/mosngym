-- =============================================================================
-- Migration 007: CRM — Leads & Communications
-- =============================================================================

-- ---------------------------------------------------------------------------
-- LEADS (prospects before they become full members)
-- ---------------------------------------------------------------------------
CREATE TABLE leads (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  first_name            TEXT        NOT NULL,
  last_name             TEXT,
  email                 TEXT,
  phone                 TEXT,
  source                TEXT        NOT NULL DEFAULT 'unknown'
                          CHECK (source IN ('website','walk_in','referral','social','widget','import','other')),
  stage                 TEXT        NOT NULL DEFAULT 'new'
                          CHECK (stage IN ('new','contacted','trial_booked','trial_done','converted','lost')),
  assigned_to_id        UUID        REFERENCES staff(id) ON DELETE SET NULL,
  interested_plan_id    UUID        REFERENCES membership_plans(id) ON DELETE SET NULL,
  notes                 TEXT,

  -- trial pass
  trial_pass_issued_at  TIMESTAMPTZ,
  trial_expires_at      TIMESTAMPTZ,

  -- conversion
  converted_at          TIMESTAMPTZ,
  converted_member_id   UUID        REFERENCES members(id) ON DELETE SET NULL,

  -- lost reason
  lost_reason           TEXT,
  lost_at               TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER leads_immutable_gym_id
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX leads_gym_id_idx         ON leads (gym_id);
CREATE INDEX leads_gym_stage_idx      ON leads (gym_id, stage);
CREATE INDEX leads_gym_assigned_idx   ON leads (gym_id, assigned_to_id);
CREATE INDEX leads_gym_created_at_idx ON leads (gym_id, created_at DESC);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY leads_gym_isolation ON leads
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- COMMUNICATION_TEMPLATES (reusable message templates)
-- ---------------------------------------------------------------------------
CREATE TABLE communication_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  channel     TEXT        NOT NULL CHECK (channel IN ('email','sms','push')),
  subject     TEXT,       -- email only
  body        TEXT        NOT NULL,
  -- body supports {{member.first_name}}, {{gym.name}} etc.
  variables   TEXT[]      NOT NULL DEFAULT '{}',  -- declared placeholders
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER communication_templates_updated_at
  BEFORE UPDATE ON communication_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX communication_templates_gym_id_idx ON communication_templates (gym_id);

ALTER TABLE communication_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY communication_templates_gym_isolation ON communication_templates
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- AUTOMATION_RULES (trigger → delay → send message)
-- ---------------------------------------------------------------------------
CREATE TABLE automation_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  trigger_event   TEXT        NOT NULL,
  -- events: member.created | subscription.expiring | subscription.expired
  --         booking.confirmed | booking.cancelled | checkin.recorded
  --         payment.failed | member.birthday | lead.created | lead.trial_done
  delay_hours     INT         NOT NULL DEFAULT 0,
  channel         TEXT        NOT NULL CHECK (channel IN ('email','sms','push')),
  template_id     UUID        REFERENCES communication_templates(id) ON DELETE SET NULL,
  -- custom body when no template
  custom_subject  TEXT,
  custom_body     TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX automation_rules_gym_id_idx       ON automation_rules (gym_id);
CREATE INDEX automation_rules_gym_event_idx    ON automation_rules (gym_id, trigger_event)
  WHERE is_active = TRUE;

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY automation_rules_gym_isolation ON automation_rules
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- COMMUNICATIONS (sent message log — append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE communications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID        REFERENCES members(id) ON DELETE SET NULL,
  lead_id         UUID        REFERENCES leads(id) ON DELETE SET NULL,
  automation_id   UUID        REFERENCES automation_rules(id) ON DELETE SET NULL,
  template_id     UUID        REFERENCES communication_templates(id) ON DELETE SET NULL,

  channel         TEXT        NOT NULL CHECK (channel IN ('email','sms','push')),
  recipient       TEXT        NOT NULL,  -- email address or phone number or device token
  subject         TEXT,
  body            TEXT        NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sent','delivered','failed','bounced')),
  provider_id     TEXT,       -- Twilio SID / SendGrid message ID / FCM message ID
  failure_reason  TEXT,
  sent_by_id      UUID        REFERENCES staff(id) ON DELETE SET NULL,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX communications_gym_id_idx       ON communications (gym_id);
CREATE INDEX communications_gym_member_idx   ON communications (gym_id, member_id);
CREATE INDEX communications_gym_created_idx  ON communications (gym_id, created_at DESC);
CREATE INDEX communications_gym_status_idx   ON communications (gym_id, status);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;
CREATE POLICY communications_gym_isolation ON communications
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- NOTIFICATION_PREFERENCES (per-member opt-in/out per channel+event)
-- ---------------------------------------------------------------------------
CREATE TABLE notification_preferences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id   UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  channel     TEXT        NOT NULL CHECK (channel IN ('email','sms','push')),
  event_type  TEXT        NOT NULL,  -- matches automation trigger_event values
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT notification_preferences_uk UNIQUE (gym_id, member_id, channel, event_type)
);

CREATE INDEX notification_preferences_gym_member_idx ON notification_preferences (gym_id, member_id);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_gym_isolation ON notification_preferences
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- PUSH_TOKENS (FCM / APNs device tokens per member)
-- ---------------------------------------------------------------------------
CREATE TABLE push_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id   UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL,
  platform    TEXT        NOT NULL CHECK (platform IN ('ios','android','web')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,

  CONSTRAINT push_tokens_uk UNIQUE (gym_id, member_id, token)
);

CREATE INDEX push_tokens_gym_member_idx ON push_tokens (gym_id, member_id);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY push_tokens_gym_isolation ON push_tokens
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);
