-- =============================================================================
-- Migration 006: Check-ins & Access Control
-- =============================================================================

-- ---------------------------------------------------------------------------
-- ACCESS_DEVICES (physical door controllers registered per location)
-- ---------------------------------------------------------------------------
CREATE TABLE access_devices (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  location_id     UUID        NOT NULL REFERENCES gym_locations(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,  -- e.g. "Front Door", "Studio A"
  type            TEXT        NOT NULL
                    CHECK (type IN ('qr_scanner','ble_reader','pin_pad','fob_reader','turnstile')),
  hardware_id     TEXT        NOT NULL,  -- serial / MAC address from device
  device_token    TEXT,                  -- long-lived auth token sent with each request
  firmware_version TEXT,
  last_seen_at    TIMESTAMPTZ,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT access_devices_hardware_uk UNIQUE (hardware_id)
);

CREATE TRIGGER access_devices_updated_at
  BEFORE UPDATE ON access_devices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX access_devices_gym_id_idx       ON access_devices (gym_id);
CREATE INDEX access_devices_gym_location_idx ON access_devices (gym_id, location_id);

ALTER TABLE access_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY access_devices_gym_isolation ON access_devices
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- CHECK_INS (every entry and exit event)
-- ---------------------------------------------------------------------------
CREATE TABLE check_ins (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  location_id     UUID        NOT NULL REFERENCES gym_locations(id) ON DELETE RESTRICT,
  device_id       UUID        REFERENCES access_devices(id) ON DELETE SET NULL,
  booking_id      UUID        REFERENCES bookings(id) ON DELETE SET NULL,
  -- ^ set when check-in is for a specific class booking

  method          TEXT        NOT NULL
                    CHECK (method IN ('qr','ble','pin','fob','manual','app')),
  result          TEXT        NOT NULL DEFAULT 'granted'
                    CHECK (result IN ('granted','denied','warning')),
  deny_reason     TEXT,
  -- e.g. 'membership_expired', 'membership_frozen', 'outside_access_hours'

  checked_in_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_out_at  TIMESTAMPTZ,

  CONSTRAINT check_ins_checkout_after_checkin
    CHECK (checked_out_at IS NULL OR checked_out_at > checked_in_at)
);

-- Note: check_ins is append-only (no UPDATE trigger needed for immutability)
-- Allow updates only for the checked_out_at column via app logic

CREATE INDEX check_ins_gym_id_idx           ON check_ins (gym_id);
CREATE INDEX check_ins_gym_member_idx       ON check_ins (gym_id, member_id);
CREATE INDEX check_ins_gym_checked_in_idx   ON check_ins (gym_id, checked_in_at DESC);
CREATE INDEX check_ins_gym_location_idx     ON check_ins (gym_id, location_id);
-- "Who is currently inside?" query
CREATE INDEX check_ins_currently_inside_idx ON check_ins (gym_id, location_id, checked_in_at)
  WHERE checked_out_at IS NULL AND result = 'granted';

ALTER TABLE check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY check_ins_gym_isolation ON check_ins
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- Helper view: members currently inside (drives the live check-in dashboard)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW members_currently_inside AS
SELECT
  ci.gym_id,
  ci.location_id,
  ci.member_id,
  m.first_name,
  m.last_name,
  m.photo_url,
  ci.checked_in_at,
  ci.method
FROM check_ins ci
JOIN members m ON m.id = ci.member_id
WHERE ci.checked_out_at IS NULL
  AND ci.result = 'granted';
