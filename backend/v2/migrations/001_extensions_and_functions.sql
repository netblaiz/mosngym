-- =============================================================================
-- Migration 001: Extensions & Helper Functions
-- =============================================================================

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Trigram indexes for fast ILIKE search on names/emails
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- Helper: auto-update updated_at on any table that has it
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Helper: enforce gym_id immutability (prevent row from being moved to another tenant)
-- =============================================================================
CREATE OR REPLACE FUNCTION prevent_gym_id_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.gym_id <> OLD.gym_id THEN
    RAISE EXCEPTION 'gym_id is immutable — cannot reassign row to a different tenant';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Helper: emit a generic audit log entry (called from service layer via SQL)
-- =============================================================================
CREATE OR REPLACE FUNCTION record_audit_log(
  p_gym_id      UUID,
  p_actor_id    UUID,
  p_actor_type  TEXT,  -- 'member' | 'staff' | 'device' | 'system'
  p_action      TEXT,  -- 'create' | 'update' | 'delete' | 'login' etc.
  p_resource    TEXT,  -- table name e.g. 'members'
  p_resource_id UUID,
  p_diff        JSONB DEFAULT NULL,
  p_ip_address  INET  DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO audit_logs (
    gym_id, actor_id, actor_type, action,
    resource, resource_id, diff, ip_address
  ) VALUES (
    p_gym_id, p_actor_id, p_actor_type, p_action,
    p_resource, p_resource_id, p_diff, p_ip_address
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
