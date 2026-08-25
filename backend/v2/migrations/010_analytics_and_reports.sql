-- =============================================================================
-- Migration 010: Analytics Snapshots & Saved Reports
-- =============================================================================
-- Live aggregation queries on large tables are slow.
-- Instead we pre-compute daily snapshots via a BullMQ cron job and cache them.
-- This table is the persistent store; Redis caches the hot window.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ANALYTICS_DAILY_SNAPSHOTS (one row per gym per day)
-- ---------------------------------------------------------------------------
CREATE TABLE analytics_daily_snapshots (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id                UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  snapshot_date         DATE          NOT NULL,

  -- membership
  total_members_active  INT           NOT NULL DEFAULT 0,
  new_members           INT           NOT NULL DEFAULT 0,
  cancelled_members     INT           NOT NULL DEFAULT 0,
  frozen_members        INT           NOT NULL DEFAULT 0,

  -- revenue
  revenue_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue_subscriptions NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue_pos           NUMERIC(12,2) NOT NULL DEFAULT 0,
  revenue_one_off       NUMERIC(12,2) NOT NULL DEFAULT 0,
  failed_payments       INT           NOT NULL DEFAULT 0,

  -- attendance
  checkins_total        INT           NOT NULL DEFAULT 0,
  unique_visitors       INT           NOT NULL DEFAULT 0,

  -- bookings
  bookings_confirmed    INT           NOT NULL DEFAULT 0,
  bookings_cancelled    INT           NOT NULL DEFAULT 0,
  bookings_no_show      INT           NOT NULL DEFAULT 0,

  -- classes
  classes_held          INT           NOT NULL DEFAULT 0,
  avg_class_fill_rate   NUMERIC(5,2), -- percentage 0–100

  -- leads
  new_leads             INT           NOT NULL DEFAULT 0,
  leads_converted       INT           NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT analytics_daily_gym_date_uk UNIQUE (gym_id, snapshot_date)
);

CREATE INDEX analytics_daily_gym_date_idx ON analytics_daily_snapshots (gym_id, snapshot_date DESC);

ALTER TABLE analytics_daily_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_daily_gym_isolation ON analytics_daily_snapshots
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- SAVED_REPORTS (custom report configurations saved by gym owners)
-- ---------------------------------------------------------------------------
CREATE TABLE saved_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  created_by_id   UUID        REFERENCES staff(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  type            TEXT        NOT NULL,
  -- 'revenue' | 'members' | 'retention' | 'classes' | 'checkins' | 'custom'

  -- report config: metrics, filters, groupings, date range
  config          JSONB       NOT NULL DEFAULT '{}',
  -- e.g. {"metrics":["revenue","new_members"],"group_by":"month","filters":{"plan_id":"..."}}

  -- scheduled delivery
  schedule_cron   TEXT,       -- e.g. "0 8 * * 1" (every Monday at 8am)
  schedule_emails TEXT[],     -- recipient list
  last_run_at     TIMESTAMPTZ,
  next_run_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER saved_reports_updated_at
  BEFORE UPDATE ON saved_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX saved_reports_gym_id_idx      ON saved_reports (gym_id);
CREATE INDEX saved_reports_next_run_idx    ON saved_reports (next_run_at)
  WHERE schedule_cron IS NOT NULL;

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_reports_gym_isolation ON saved_reports
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);
