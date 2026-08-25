-- =============================================================================
-- Migration 011: Post-Setup — Seed Defaults & Provisioning Trigger
-- =============================================================================
-- When a new gym is created, automatically seed:
--   • one primary gym_location
--   • one gym_settings row
--   • default automation rules (birthday, expiry reminder, welcome)
-- This keeps tenant provisioning atomic and consistent.
-- =============================================================================

CREATE OR REPLACE FUNCTION provision_new_gym()
RETURNS TRIGGER AS $$
DECLARE
  v_location_id UUID;
BEGIN
  -- 1. Default location
  INSERT INTO gym_locations (gym_id, name, is_primary, is_active)
  VALUES (NEW.id, NEW.name, TRUE, TRUE)
  RETURNING id INTO v_location_id;

  -- 2. Default settings
  INSERT INTO gym_settings (gym_id)
  VALUES (NEW.id);

  -- 3. Seed default automation rules
  INSERT INTO automation_rules (gym_id, name, trigger_event, delay_hours, channel, custom_subject, custom_body, is_active)
  VALUES
    (
      NEW.id,
      'Welcome email',
      'member.created',
      0,
      'email',
      'Welcome to {{gym.name}}!',
      'Hi {{member.first_name}}, welcome to {{gym.name}}! We''re so glad you''re here.',
      TRUE
    ),
    (
      NEW.id,
      'Membership expiry reminder (7 days)',
      'subscription.expiring',
      0,
      'email',
      'Your membership at {{gym.name}} is expiring soon',
      'Hi {{member.first_name}}, your membership expires in 7 days. Renew now to keep access.',
      TRUE
    ),
    (
      NEW.id,
      'Failed payment notification',
      'payment.failed',
      0,
      'email',
      'Action required: payment failed',
      'Hi {{member.first_name}}, we couldn''t process your payment. Please update your card.',
      TRUE
    ),
    (
      NEW.id,
      'Birthday message',
      'member.birthday',
      0,
      'email',
      'Happy Birthday from {{gym.name}}! 🎂',
      'Hi {{member.first_name}}, wishing you a fantastic birthday from everyone at {{gym.name}}!',
      TRUE
    );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gyms_provision_on_insert
  AFTER INSERT ON gyms
  FOR EACH ROW EXECUTE FUNCTION provision_new_gym();

-- =============================================================================
-- Useful computed columns / helper functions for app layer
-- =============================================================================

-- Is a member's subscription currently active and not frozen?
CREATE OR REPLACE FUNCTION is_subscription_access_allowed(sub member_subscriptions)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN sub.status = 'active'
    AND (sub.end_date IS NULL OR sub.end_date >= CURRENT_DATE)
    AND (sub.frozen_from IS NULL OR CURRENT_DATE < sub.frozen_from OR CURRENT_DATE > sub.frozen_until);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Does a member have an active subscription in this gym?
CREATE OR REPLACE FUNCTION member_has_active_subscription(p_gym_id UUID, p_member_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM member_subscriptions
    WHERE gym_id = p_gym_id
      AND member_id = p_member_id
      AND status = 'active'
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
      AND (frozen_from IS NULL OR CURRENT_DATE < frozen_from OR CURRENT_DATE > frozen_until)
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Count confirmed bookings for a session (used in booking insert logic)
CREATE OR REPLACE FUNCTION count_confirmed_bookings(p_session_id UUID)
RETURNS INT AS $$
BEGIN
  RETURN (
    SELECT COUNT(*) FROM bookings
    WHERE session_id = p_session_id AND status = 'confirmed'
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- Database roles
-- =============================================================================

-- App server role (used by API): RLS applies via current_setting
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_user;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- Super-admin role: bypasses RLS (for your platform admin ops)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'super_admin') THEN
    CREATE ROLE super_admin LOGIN BYPASSRLS;
  END IF;
END $$;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO super_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO super_admin;

-- Read-only role for analytics / reporting jobs
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'reader') THEN
    CREATE ROLE reader LOGIN;
  END IF;
END $$;

GRANT CONNECT ON DATABASE postgres TO reader;
GRANT USAGE ON SCHEMA public TO reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO reader;
