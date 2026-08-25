-- =============================================================================
-- Migration 012: RBAC — Permissions, Role Templates & Staff Assignments
-- =============================================================================
-- Model:
--   permissions         — atomic named capabilities (e.g. members:read)
--   role_templates      — named bundles of permissions (e.g. "Front Desk")
--                         • system templates: seeded by platform, read-only
--                         • custom templates: created by gym owner per gym
--   staff_role_assignments — which template(s) a staff member is assigned
--   staff_permission_overrides — per-user grant or revoke on top of their roles
--
-- Effective permission resolution (checked in middleware):
--   1. Collect all permissions from all assigned role templates
--   2. Apply overrides: explicit GRANT wins over role, explicit REVOKE wins over role
--   3. Default = DENY if not in any role and no grant override
-- =============================================================================

-- ---------------------------------------------------------------------------
-- PERMISSIONS (canonical list of all capabilities in the system)
-- ---------------------------------------------------------------------------
CREATE TABLE permissions (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT    NOT NULL,   -- e.g. 'members:read'
  group_name  TEXT    NOT NULL,   -- e.g. 'Members' — for UI grouping
  label       TEXT    NOT NULL,   -- e.g. 'View members'
  description TEXT,               -- tooltip copy in the settings UI
  is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  -- sensitive = billing, API keys, audit logs — shown with extra warning in UI

  CONSTRAINT permissions_key_uk UNIQUE (key)
);

-- Seed all system permissions
INSERT INTO permissions (key, group_name, label, description, is_sensitive) VALUES

  -- ── Members ──────────────────────────────────────────────────────────────
  ('members:read',            'Members', 'View members',            'See the member list and profile pages', false),
  ('members:create',          'Members', 'Add members',             'Create new member records', false),
  ('members:edit',            'Members', 'Edit members',            'Update member contact info, health notes, status', false),
  ('members:delete',          'Members', 'Delete members',          'Soft-delete a member record', true),
  ('members:export',          'Members', 'Export member data',      'Download member list as CSV', true),

  -- ── Subscriptions ────────────────────────────────────────────────────────
  ('subscriptions:read',      'Subscriptions', 'View subscriptions',  'See a member''s active plan and billing dates', false),
  ('subscriptions:create',    'Subscriptions', 'Assign plans',        'Assign a membership plan to a member', false),
  ('subscriptions:edit',      'Subscriptions', 'Manage subscriptions','Freeze, unfreeze, upgrade, or cancel plans', false),
  ('subscriptions:cancel',    'Subscriptions', 'Cancel subscriptions','Cancel a member''s membership', true),

  -- ── Billing ──────────────────────────────────────────────────────────────
  ('billing:read',            'Billing', 'View billing',            'See payment history and invoices', true),
  ('billing:charge',          'Billing', 'Charge members',          'Process one-off payments', true),
  ('billing:refund',          'Billing', 'Refund payments',         'Issue full or partial refunds', true),
  ('billing:export',          'Billing', 'Export financial reports', 'Download billing reports and transaction CSVs', true),

  -- ── Classes & Bookings ───────────────────────────────────────────────────
  ('classes:read',            'Classes', 'View timetable',          'See the class schedule', false),
  ('classes:create',          'Classes', 'Create classes',          'Add new sessions or recurring series', false),
  ('classes:edit',            'Classes', 'Edit classes',            'Update session details, capacity, trainer', false),
  ('classes:cancel',          'Classes', 'Cancel classes',          'Cancel a session and notify attendees', false),
  ('bookings:read',           'Classes', 'View bookings',           'See who is booked into a class', false),
  ('bookings:manage',         'Classes', 'Manage bookings',         'Add or remove members from class bookings', false),

  -- ── Check-ins ────────────────────────────────────────────────────────────
  ('checkins:read',           'Check-ins', 'View check-in log',     'See member entry history', false),
  ('checkins:create',         'Check-ins', 'Manual check-in',       'Manually check a member in at the front desk', false),

  -- ── Staff ────────────────────────────────────────────────────────────────
  ('staff:read',              'Staff', 'View staff',                'See the staff list and profiles', false),
  ('staff:invite',            'Staff', 'Invite staff',              'Send invitations to new staff members', true),
  ('staff:edit',              'Staff', 'Edit staff',                'Update staff roles, bio, certifications', true),
  ('staff:deactivate',        'Staff', 'Deactivate staff',          'Disable a staff member''s access', true),
  ('staff:permissions',       'Staff', 'Manage permissions',        'Change staff roles and permission overrides', true),
  ('staff:schedule:read',     'Staff', 'View shift schedule',       'See staff shift roster', false),
  ('staff:schedule:edit',     'Staff', 'Edit shift schedule',       'Create and update staff shifts', false),

  -- ── CRM & Leads ──────────────────────────────────────────────────────────
  ('leads:read',              'CRM', 'View leads',                  'See the lead pipeline', false),
  ('leads:create',            'CRM', 'Add leads',                   'Create new leads manually', false),
  ('leads:edit',              'CRM', 'Edit leads',                  'Update lead stage, notes, assignment', false),
  ('leads:convert',           'CRM', 'Convert leads',               'Convert a lead into a full member', false),
  ('leads:delete',            'CRM', 'Delete leads',                'Remove leads from the pipeline', false),

  -- ── Communications ───────────────────────────────────────────────────────
  ('communications:read',     'Communications', 'View message history',   'See sent messages log', false),
  ('communications:send',     'Communications', 'Send messages',          'Send SMS, email, or push to members', false),
  ('automations:read',        'Communications', 'View automations',       'See automation rules and templates', false),
  ('automations:edit',        'Communications', 'Manage automations',     'Create and edit automation rules', true),

  -- ── POS ──────────────────────────────────────────────────────────────────
  ('pos:read',                'Point of Sale', 'View sales history',     'See POS transactions', false),
  ('pos:sell',                'Point of Sale', 'Process sales',          'Ring up products and process payment', false),
  ('pos:refund',              'Point of Sale', 'Refund sales',           'Issue POS refunds', false),
  ('pos:products:edit',       'Point of Sale', 'Manage products',        'Add, edit, or archive POS products', false),

  -- ── Fitness / Workouts ───────────────────────────────────────────────────
  ('fitness:read',            'Fitness', 'View fitness data',       'See member workout programs and measurements', false),
  ('fitness:edit',            'Fitness', 'Manage fitness data',     'Create and edit workout programs and goals', false),

  -- ── Analytics ────────────────────────────────────────────────────────────
  ('analytics:read',          'Analytics', 'View analytics',        'Access the analytics and reporting dashboard', false),
  ('analytics:export',        'Analytics', 'Export reports',        'Download analytics reports as CSV/XLSX', true),
  ('reports:manage',          'Analytics', 'Manage saved reports',  'Create and schedule saved reports', false),

  -- ── Settings ─────────────────────────────────────────────────────────────
  ('settings:read',           'Settings', 'View gym settings',      'See gym profile, settings, integrations', false),
  ('settings:edit',           'Settings', 'Edit gym settings',      'Update gym profile, branding, booking rules', true),
  ('integrations:manage',     'Settings', 'Manage integrations',    'Connect or disconnect third-party services', true),
  ('api_keys:manage',         'Settings', 'Manage API keys',        'Issue and revoke API keys', true),
  ('audit:read',              'Settings', 'View audit log',         'Access the full audit trail', true),
  ('plans:manage',            'Settings', 'Manage membership plans','Create and edit membership plan templates', true),
  ('devices:manage',          'Settings', 'Manage access devices',  'Register and configure door control devices', true);

-- ---------------------------------------------------------------------------
-- ROLE_TEMPLATES (named bundles of permissions)
-- ---------------------------------------------------------------------------
CREATE TABLE role_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id      UUID        REFERENCES gyms(id) ON DELETE CASCADE,
  -- NULL gym_id = system template (seeded by platform, available to all gyms, read-only)
  -- non-NULL gym_id = custom template created by this gym

  name        TEXT        NOT NULL,
  description TEXT,
  color       CHAR(7)     NOT NULL DEFAULT '#6366f1',  -- badge color in UI
  icon        TEXT        NOT NULL DEFAULT 'user',     -- lucide icon name
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,      -- TRUE = cannot be edited/deleted by gym
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT role_templates_name_gym_uk UNIQUE (COALESCE(gym_id, '00000000-0000-0000-0000-000000000000'::UUID), name)
);

CREATE TRIGGER role_templates_updated_at
  BEFORE UPDATE ON role_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Prevent edits to system templates
CREATE OR REPLACE FUNCTION prevent_system_role_edit()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_system = TRUE THEN
    RAISE EXCEPTION 'System role templates cannot be modified. Create a custom role instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER role_templates_no_system_edit
  BEFORE UPDATE OR DELETE ON role_templates
  FOR EACH ROW
  WHEN (OLD.is_system = TRUE)
  EXECUTE FUNCTION prevent_system_role_edit();

CREATE INDEX role_templates_gym_id_idx ON role_templates (gym_id);

ALTER TABLE role_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_templates_gym_isolation ON role_templates
  USING (
    gym_id IS NULL  -- system templates visible to all
    OR gym_id = current_setting('app.current_gym_id', TRUE)::UUID
  );

-- ---------------------------------------------------------------------------
-- ROLE_TEMPLATE_PERMISSIONS (many-to-many: role ↔ permissions)
-- ---------------------------------------------------------------------------
CREATE TABLE role_template_permissions (
  role_template_id  UUID  NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
  permission_key    TEXT  NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,

  PRIMARY KEY (role_template_id, permission_key)
);

CREATE INDEX rtp_permission_key_idx ON role_template_permissions (permission_key);

-- ---------------------------------------------------------------------------
-- STAFF_ROLE_ASSIGNMENTS (which role templates a staff member has)
-- ---------------------------------------------------------------------------
CREATE TABLE staff_role_assignments (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id            UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_id          UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  role_template_id  UUID        NOT NULL REFERENCES role_templates(id) ON DELETE CASCADE,
  assigned_by_id    UUID        REFERENCES staff(id) ON DELETE SET NULL,
  assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT staff_role_uk UNIQUE (gym_id, staff_id, role_template_id)
);

CREATE INDEX staff_role_assignments_gym_staff_idx ON staff_role_assignments (gym_id, staff_id);

ALTER TABLE staff_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_role_assignments_gym_isolation ON staff_role_assignments
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- STAFF_PERMISSION_OVERRIDES (per-user grant or revoke on top of roles)
-- ---------------------------------------------------------------------------
CREATE TABLE staff_permission_overrides (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_id        UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  permission_key  TEXT        NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
  effect          TEXT        NOT NULL CHECK (effect IN ('grant', 'revoke')),
  -- grant  = explicitly allow even if no role grants it
  -- revoke = explicitly deny even if a role grants it
  reason          TEXT,
  set_by_id       UUID        REFERENCES staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT staff_permission_overrides_uk UNIQUE (gym_id, staff_id, permission_key)
);

CREATE TRIGGER staff_permission_overrides_updated_at
  BEFORE UPDATE ON staff_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX staff_permission_overrides_gym_staff_idx ON staff_permission_overrides (gym_id, staff_id);

ALTER TABLE staff_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_permission_overrides_gym_isolation ON staff_permission_overrides
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- Function: resolve effective permissions for a staff member
-- Returns a set of permission keys the staff member currently has
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_staff_permissions(p_gym_id UUID, p_staff_id UUID)
RETURNS TABLE (permission_key TEXT, source TEXT) AS $$
BEGIN
  RETURN QUERY
  WITH
  -- 1. All permissions granted via assigned roles
  role_perms AS (
    SELECT rtp.permission_key, 'role' AS source
    FROM staff_role_assignments sra
    JOIN role_template_permissions rtp ON rtp.role_template_id = sra.role_template_id
    WHERE sra.gym_id = p_gym_id AND sra.staff_id = p_staff_id
  ),
  -- 2. Explicit per-user overrides
  overrides AS (
    SELECT spo.permission_key, spo.effect
    FROM staff_permission_overrides spo
    WHERE spo.gym_id = p_gym_id AND spo.staff_id = p_staff_id
  )
  SELECT DISTINCT rp.permission_key, rp.source
  FROM role_perms rp
  -- Remove any explicitly revoked permissions
  WHERE rp.permission_key NOT IN (
    SELECT o.permission_key FROM overrides o WHERE o.effect = 'revoke'
  )

  UNION

  -- Add explicitly granted overrides (even if no role grants them)
  SELECT o.permission_key, 'override_grant' AS source
  FROM overrides o
  WHERE o.effect = 'grant';
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Function: check if a staff member has a specific permission
-- Used in application middleware: SELECT check_staff_permission($gymId, $staffId, 'members:read')
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_staff_permission(
  p_gym_id        UUID,
  p_staff_id      UUID,
  p_permission    TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_is_owner BOOLEAN;
  v_override TEXT;
BEGIN
  -- Gym owner always has all permissions
  SELECT (s.role = 'owner') INTO v_is_owner
  FROM staff s WHERE s.id = p_staff_id AND s.gym_id = p_gym_id;

  IF v_is_owner THEN RETURN TRUE; END IF;

  -- Check explicit override first (overrides win over roles)
  SELECT effect INTO v_override
  FROM staff_permission_overrides
  WHERE gym_id = p_gym_id AND staff_id = p_staff_id AND permission_key = p_permission;

  IF v_override = 'revoke' THEN RETURN FALSE; END IF;
  IF v_override = 'grant'  THEN RETURN TRUE;  END IF;

  -- Fall back to role assignments
  RETURN EXISTS (
    SELECT 1
    FROM staff_role_assignments sra
    JOIN role_template_permissions rtp ON rtp.role_template_id = sra.role_template_id
    WHERE sra.gym_id = p_gym_id
      AND sra.staff_id = p_staff_id
      AND rtp.permission_key = p_permission
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Seed system role templates with their default permissions
-- ---------------------------------------------------------------------------

-- Helper to insert a system role and return its ID
CREATE OR REPLACE FUNCTION seed_system_role(
  p_name TEXT, p_description TEXT, p_color CHAR(7), p_icon TEXT
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO role_templates (gym_id, name, description, color, icon, is_system, is_active)
  VALUES (NULL, p_name, p_description, p_color, p_icon, TRUE, TRUE)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM role_templates WHERE gym_id IS NULL AND name = p_name;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  r_manager       UUID;
  r_trainer       UUID;
  r_front_desk    UUID;
  r_instructor    UUID;
  r_sales         UUID;
  r_readonly      UUID;
BEGIN

  -- ── Manager ────────────────────────────────────────────────────────────
  r_manager := seed_system_role(
    'Manager', 'Full access except platform settings and billing exports',
    '#7c3aed', 'shield'
  );
  INSERT INTO role_template_permissions (role_template_id, permission_key)
  SELECT r_manager, key FROM permissions
  WHERE key NOT IN ('audit:read','api_keys:manage','billing:export','members:export')
  ON CONFLICT DO NOTHING;

  -- ── Personal Trainer ────────────────────────────────────────────────────
  r_trainer := seed_system_role(
    'Personal Trainer', 'Manage own clients — workouts, bookings, measurements',
    '#0891b2', 'dumbbell'
  );
  INSERT INTO role_template_permissions (role_template_id, permission_key)
  VALUES
    (r_trainer, 'members:read'),
    (r_trainer, 'members:edit'),
    (r_trainer, 'subscriptions:read'),
    (r_trainer, 'classes:read'),
    (r_trainer, 'classes:create'),
    (r_trainer, 'classes:edit'),
    (r_trainer, 'bookings:read'),
    (r_trainer, 'bookings:manage'),
    (r_trainer, 'checkins:read'),
    (r_trainer, 'fitness:read'),
    (r_trainer, 'fitness:edit'),
    (r_trainer, 'communications:send'),
    (r_trainer, 'leads:read'),
    (r_trainer, 'staff:schedule:read')
  ON CONFLICT DO NOTHING;

  -- ── Front Desk ──────────────────────────────────────────────────────────
  r_front_desk := seed_system_role(
    'Front Desk', 'Day-to-day member handling — check-ins, bookings, basic sales',
    '#059669', 'monitor'
  );
  INSERT INTO role_template_permissions (role_template_id, permission_key)
  VALUES
    (r_front_desk, 'members:read'),
    (r_front_desk, 'members:create'),
    (r_front_desk, 'members:edit'),
    (r_front_desk, 'subscriptions:read'),
    (r_front_desk, 'subscriptions:create'),
    (r_front_desk, 'classes:read'),
    (r_front_desk, 'bookings:read'),
    (r_front_desk, 'bookings:manage'),
    (r_front_desk, 'checkins:read'),
    (r_front_desk, 'checkins:create'),
    (r_front_desk, 'pos:read'),
    (r_front_desk, 'pos:sell'),
    (r_front_desk, 'leads:read'),
    (r_front_desk, 'leads:create'),
    (r_front_desk, 'leads:edit'),
    (r_front_desk, 'communications:read'),
    (r_front_desk, 'communications:send'),
    (r_front_desk, 'staff:schedule:read')
  ON CONFLICT DO NOTHING;

  -- ── Group Instructor ────────────────────────────────────────────────────
  r_instructor := seed_system_role(
    'Group Instructor', 'Manage and run group classes, view attendees',
    '#d97706', 'users'
  );
  INSERT INTO role_template_permissions (role_template_id, permission_key)
  VALUES
    (r_instructor, 'members:read'),
    (r_instructor, 'classes:read'),
    (r_instructor, 'classes:create'),
    (r_instructor, 'classes:edit'),
    (r_instructor, 'bookings:read'),
    (r_instructor, 'bookings:manage'),
    (r_instructor, 'checkins:read'),
    (r_instructor, 'checkins:create'),
    (r_instructor, 'staff:schedule:read')
  ON CONFLICT DO NOTHING;

  -- ── Sales ────────────────────────────────────────────────────────────────
  r_sales := seed_system_role(
    'Sales', 'Lead management, member signup, and plan assignment',
    '#db2777', 'trending-up'
  );
  INSERT INTO role_template_permissions (role_template_id, permission_key)
  VALUES
    (r_sales, 'members:read'),
    (r_sales, 'members:create'),
    (r_sales, 'members:edit'),
    (r_sales, 'subscriptions:read'),
    (r_sales, 'subscriptions:create'),
    (r_sales, 'leads:read'),
    (r_sales, 'leads:create'),
    (r_sales, 'leads:edit'),
    (r_sales, 'leads:convert'),
    (r_sales, 'communications:read'),
    (r_sales, 'communications:send'),
    (r_sales, 'plans:manage'),
    (r_sales, 'classes:read'),
    (r_sales, 'analytics:read')
  ON CONFLICT DO NOTHING;

  -- ── Read Only ────────────────────────────────────────────────────────────
  r_readonly := seed_system_role(
    'Read Only', 'View-only access across the platform — no write permissions',
    '#64748b', 'eye'
  );
  INSERT INTO role_template_permissions (role_template_id, permission_key)
  SELECT r_readonly, key FROM permissions
  WHERE key LIKE '%:read' OR key LIKE '%:read%'
  ON CONFLICT DO NOTHING;

END $$;

-- Drop the helper — no longer needed
DROP FUNCTION seed_system_role;
