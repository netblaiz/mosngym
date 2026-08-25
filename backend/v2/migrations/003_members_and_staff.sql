-- =============================================================================
-- Migration 003: Members & Staff
-- =============================================================================
-- All tables from here onwards carry gym_id and are protected by RLS.
-- The app must call: SET LOCAL app.current_gym_id = '<uuid>';
-- before any query, which activates the policies below.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- MEMBERS
-- ---------------------------------------------------------------------------
CREATE TABLE members (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id              UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  user_id             UUID        REFERENCES users(id) ON DELETE SET NULL,
  -- user_id is null until the member activates their account / sets a password

  email               TEXT        NOT NULL,
  phone               TEXT,
  first_name          TEXT        NOT NULL,
  last_name           TEXT        NOT NULL,
  date_of_birth       DATE,
  gender              TEXT        CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
  photo_url           TEXT,

  -- health / waiver
  emergency_contact   JSONB,
  -- {"name":"Jane Doe","phone":"+1234567890","relationship":"spouse"}
  health_notes        TEXT,
  waiver_signed_at    TIMESTAMPTZ,

  -- status
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','frozen','banned')),
  referred_by_id      UUID        REFERENCES members(id) ON DELETE SET NULL,

  -- soft delete
  deleted_at          TIMESTAMPTZ,

  joined_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- email unique per gym (two different gyms can have same email)
  CONSTRAINT members_email_gym_uk UNIQUE (gym_id, email)
);

CREATE TRIGGER members_updated_at
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER members_immutable_gym_id
  BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX members_gym_id_idx            ON members (gym_id);
CREATE INDEX members_gym_id_status_idx     ON members (gym_id, status);
CREATE INDEX members_gym_id_user_id_idx    ON members (gym_id, user_id);
CREATE INDEX members_gym_id_joined_at_idx  ON members (gym_id, joined_at);
-- Trigram index for fast fuzzy name/email search
CREATE INDEX members_name_trgm_idx         ON members USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX members_email_trgm_idx        ON members USING GIN (email gin_trgm_ops);

-- RLS
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

CREATE POLICY members_gym_isolation ON members
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- STAFF (employees and trainers — linked to a user account)
-- ---------------------------------------------------------------------------
CREATE TABLE staff (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  role            TEXT        NOT NULL
                    CHECK (role IN ('owner','manager','trainer','front_desk','instructor')),
  bio             TEXT,
  photo_url       TEXT,
  certifications  TEXT[]      NOT NULL DEFAULT '{}',
  hourly_rate     NUMERIC(10,2),

  -- granular permission overrides (stored as flat key:bool map)
  permissions     JSONB       NOT NULL DEFAULT '{}',
  -- e.g. {"view_billing":true,"edit_members":false}

  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  invited_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- one user can only have one staff record per gym
  CONSTRAINT staff_user_gym_uk UNIQUE (gym_id, user_id)
);

CREATE TRIGGER staff_updated_at
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER staff_immutable_gym_id
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION prevent_gym_id_change();

CREATE INDEX staff_gym_id_idx         ON staff (gym_id);
CREATE INDEX staff_gym_id_role_idx    ON staff (gym_id, role);
CREATE INDEX staff_gym_id_active_idx  ON staff (gym_id, is_active);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_gym_isolation ON staff
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);
