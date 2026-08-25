-- =============================================================================
-- Migration 005: Classes, Sessions & Bookings
-- =============================================================================

-- ---------------------------------------------------------------------------
-- CLASS_TEMPLATES (reusable class types — the "what", not the "when")
-- ---------------------------------------------------------------------------
CREATE TABLE class_templates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id            UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name              TEXT        NOT NULL,
  description       TEXT,
  duration_mins     INT         NOT NULL CHECK (duration_mins > 0),
  default_capacity  INT         NOT NULL DEFAULT 20 CHECK (default_capacity > 0),
  color             CHAR(7)     NOT NULL DEFAULT '#6366f1',  -- calendar display color
  image_url         TEXT,
  category          TEXT,       -- 'yoga','hiit','cycling','pt' etc.
  requires_credits  INT         NOT NULL DEFAULT 1,          -- 0 = free with membership
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER class_templates_updated_at
  BEFORE UPDATE ON class_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER class_templates_immutable_gym_id
  BEFORE UPDATE ON class_templates
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX class_templates_gym_id_idx ON class_templates (gym_id);

ALTER TABLE class_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_templates_gym_isolation ON class_templates
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- CLASS_SESSIONS (actual scheduled instances on the timetable)
-- ---------------------------------------------------------------------------
CREATE TABLE class_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  template_id         UUID        NOT NULL REFERENCES class_templates(id) ON DELETE RESTRICT,
  trainer_id          UUID        REFERENCES staff(id) ON DELETE SET NULL,
  location_id         UUID        NOT NULL REFERENCES gym_locations(id) ON DELETE RESTRICT,

  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,

  -- capacity can be overridden per session
  capacity            INT         NOT NULL CHECK (capacity > 0),

  status              TEXT        NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  cancellation_reason TEXT,
  cancelled_at        TIMESTAMPTZ,

  -- recurrence (RFC 5545 RRULE string — e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR)
  recurrence_rule     TEXT,
  recurrence_parent_id UUID       REFERENCES class_sessions(id) ON DELETE SET NULL,
  -- ^ links recurring children back to the first session in the series

  notes               TEXT,       -- internal trainer notes
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT session_time_valid CHECK (ends_at > starts_at)
);

CREATE TRIGGER class_sessions_updated_at
  BEFORE UPDATE ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER class_sessions_immutable_gym_id
  BEFORE UPDATE ON class_sessions
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX class_sessions_gym_id_idx          ON class_sessions (gym_id);
CREATE INDEX class_sessions_gym_starts_at_idx   ON class_sessions (gym_id, starts_at);
CREATE INDEX class_sessions_gym_trainer_idx     ON class_sessions (gym_id, trainer_id);
CREATE INDEX class_sessions_gym_location_idx    ON class_sessions (gym_id, location_id);
CREATE INDEX class_sessions_gym_status_idx      ON class_sessions (gym_id, status);
CREATE INDEX class_sessions_recurrence_idx      ON class_sessions (recurrence_parent_id)
  WHERE recurrence_parent_id IS NOT NULL;

ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY class_sessions_gym_isolation ON class_sessions
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- BOOKINGS (a member's reservation for a class session)
-- ---------------------------------------------------------------------------
CREATE TABLE bookings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id           UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  session_id          UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  subscription_id     UUID        REFERENCES member_subscriptions(id) ON DELETE SET NULL,

  status              TEXT        NOT NULL DEFAULT 'confirmed'
                        CHECK (status IN ('confirmed','waitlisted','cancelled','no_show','attended')),

  -- waitlist management
  waitlist_position   INT,        -- NULL = confirmed spot; 1,2,3 = waitlist order
  waitlist_notified_at TIMESTAMPTZ,

  -- credit tracking
  credits_used        INT         NOT NULL DEFAULT 0,
  credits_refunded_at TIMESTAMPTZ,

  -- attendance
  checked_in_at       TIMESTAMPTZ,

  -- cancellation
  cancelled_at        TIMESTAMPTZ,
  cancellation_reason TEXT,
  cancelled_by_id     UUID        REFERENCES staff(id) ON DELETE SET NULL,

  booked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- a member can only have one active booking per session
  CONSTRAINT bookings_member_session_uk UNIQUE (gym_id, member_id, session_id)
);

CREATE TRIGGER bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER bookings_immutable_gym_id
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX bookings_gym_id_idx            ON bookings (gym_id);
CREATE INDEX bookings_gym_member_idx        ON bookings (gym_id, member_id);
CREATE INDEX bookings_gym_session_idx       ON bookings (gym_id, session_id);
CREATE INDEX bookings_gym_status_idx        ON bookings (gym_id, status);
CREATE INDEX bookings_gym_session_status_idx ON bookings (gym_id, session_id, status);
-- Fast waitlist ordering
CREATE INDEX bookings_waitlist_idx          ON bookings (gym_id, session_id, waitlist_position)
  WHERE status = 'waitlisted';

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY bookings_gym_isolation ON bookings
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- Helper view: session occupancy (used by booking logic to check capacity)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW session_occupancy AS
SELECT
  b.gym_id,
  b.session_id,
  cs.capacity,
  COUNT(*) FILTER (WHERE b.status = 'confirmed') AS confirmed_count,
  COUNT(*) FILTER (WHERE b.status = 'waitlisted') AS waitlisted_count,
  cs.capacity - COUNT(*) FILTER (WHERE b.status = 'confirmed') AS spots_available
FROM bookings b
JOIN class_sessions cs ON cs.id = b.session_id
GROUP BY b.gym_id, b.session_id, cs.capacity;
