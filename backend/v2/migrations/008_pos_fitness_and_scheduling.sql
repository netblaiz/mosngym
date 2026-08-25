-- =============================================================================
-- Migration 008: POS, Fitness Tracking & Staff Scheduling
-- =============================================================================

-- ---------------------------------------------------------------------------
-- POS_PRODUCTS (retail catalog per gym)
-- ---------------------------------------------------------------------------
CREATE TABLE pos_products (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  name            TEXT          NOT NULL,
  description     TEXT,
  category        TEXT,         -- 'supplement','merchandise','day_pass','other'
  price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  tax_rate        NUMERIC(5,4)  NOT NULL DEFAULT 0,
  sku             TEXT,
  stock_quantity  INT,          -- NULL = unlimited (e.g. day passes)
  low_stock_alert INT,          -- alert when stock falls below this
  image_url       TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT TRUE,
  archived_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER pos_products_updated_at
  BEFORE UPDATE ON pos_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX pos_products_gym_id_idx ON pos_products (gym_id);
CREATE INDEX pos_products_gym_active_idx ON pos_products (gym_id) WHERE archived_at IS NULL;

ALTER TABLE pos_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_products_gym_isolation ON pos_products
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- POS_SALES (a sale transaction header)
-- ---------------------------------------------------------------------------
CREATE TABLE pos_sales (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID          REFERENCES members(id) ON DELETE SET NULL,
  sold_by_id      UUID          REFERENCES staff(id) ON DELETE SET NULL,
  location_id     UUID          REFERENCES gym_locations(id) ON DELETE SET NULL,
  payment_id      UUID          REFERENCES payments(id) ON DELETE SET NULL,

  subtotal        NUMERIC(10,2) NOT NULL,
  tax_amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL,
  currency        CHAR(3)       NOT NULL DEFAULT 'USD',
  payment_method  TEXT          CHECK (payment_method IN ('card','cash','account_credit')),

  status          TEXT          NOT NULL DEFAULT 'completed'
                    CHECK (status IN ('completed','refunded','partially_refunded')),

  notes           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TRIGGER pos_sales_updated_at
  BEFORE UPDATE ON pos_sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX pos_sales_gym_id_idx        ON pos_sales (gym_id);
CREATE INDEX pos_sales_gym_member_idx    ON pos_sales (gym_id, member_id);
CREATE INDEX pos_sales_gym_created_idx   ON pos_sales (gym_id, created_at DESC);

ALTER TABLE pos_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_sales_gym_isolation ON pos_sales
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- POS_SALE_ITEMS (line items within a sale)
-- ---------------------------------------------------------------------------
CREATE TABLE pos_sale_items (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  sale_id         UUID          NOT NULL REFERENCES pos_sales(id) ON DELETE CASCADE,
  product_id      UUID          REFERENCES pos_products(id) ON DELETE SET NULL,
  product_name    TEXT          NOT NULL,  -- denormalized — snapshot at time of sale
  unit_price      NUMERIC(10,2) NOT NULL,
  quantity        INT           NOT NULL DEFAULT 1 CHECK (quantity > 0),
  tax_rate        NUMERIC(5,4)  NOT NULL DEFAULT 0,
  line_total      NUMERIC(10,2) NOT NULL,
  refunded_qty    INT           NOT NULL DEFAULT 0
);

CREATE INDEX pos_sale_items_gym_sale_idx ON pos_sale_items (gym_id, sale_id);

ALTER TABLE pos_sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY pos_sale_items_gym_isolation ON pos_sale_items
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- BODY_MEASUREMENTS (member progress tracking)
-- ---------------------------------------------------------------------------
CREATE TABLE body_measurements (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID          NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID          NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  recorded_by_id  UUID          REFERENCES staff(id) ON DELETE SET NULL,
  weight_kg       NUMERIC(6,2),
  height_cm       NUMERIC(5,1),
  body_fat_pct    NUMERIC(5,2),
  muscle_mass_kg  NUMERIC(6,2),
  -- flexible bag for waist_cm, chest_cm, hip_cm, arm_cm etc.
  measurements    JSONB         NOT NULL DEFAULT '{}',
  notes           TEXT,
  recorded_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX body_measurements_gym_member_idx    ON body_measurements (gym_id, member_id);
CREATE INDEX body_measurements_gym_recorded_idx  ON body_measurements (gym_id, member_id, recorded_at DESC);

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY body_measurements_gym_isolation ON body_measurements
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- MEMBER_GOALS (fitness goals set by member or trainer)
-- ---------------------------------------------------------------------------
CREATE TABLE member_goals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  set_by_id       UUID        REFERENCES staff(id) ON DELETE SET NULL,
  type            TEXT        NOT NULL,  -- 'weight_loss','muscle_gain','cardio','flexibility','other'
  target_value    NUMERIC(8,2),
  target_unit     TEXT,                  -- 'kg','%','minutes','reps'
  start_value     NUMERIC(8,2),
  current_value   NUMERIC(8,2),
  target_date     DATE,
  status          TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','achieved','abandoned')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER member_goals_updated_at
  BEFORE UPDATE ON member_goals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX member_goals_gym_member_idx ON member_goals (gym_id, member_id);

ALTER TABLE member_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_goals_gym_isolation ON member_goals
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- WORKOUT_PROGRAMS (trainer-assigned workout plans)
-- ---------------------------------------------------------------------------
CREATE TABLE workout_programs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id       UUID        NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  trainer_id      UUID        REFERENCES staff(id) ON DELETE SET NULL,
  name            TEXT        NOT NULL,
  description     TEXT,
  weeks           INT         NOT NULL DEFAULT 4,
  -- exercises stored as jsonb: [{week:1,day:'Mon',exercises:[{name,sets,reps,rest_secs,notes}]}]
  schedule        JSONB       NOT NULL DEFAULT '[]',
  starts_at       DATE,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER workout_programs_updated_at
  BEFORE UPDATE ON workout_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX workout_programs_gym_member_idx  ON workout_programs (gym_id, member_id);
CREATE INDEX workout_programs_gym_trainer_idx ON workout_programs (gym_id, trainer_id);

ALTER TABLE workout_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY workout_programs_gym_isolation ON workout_programs
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);

-- ---------------------------------------------------------------------------
-- STAFF_SHIFTS (scheduled work shifts)
-- ---------------------------------------------------------------------------
CREATE TABLE staff_shifts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id          UUID        NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  staff_id        UUID        NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  location_id     UUID        NOT NULL REFERENCES gym_locations(id) ON DELETE RESTRICT,
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  role_note       TEXT,       -- e.g. "Front desk cover", "Personal training only"
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','completed','no_show','swapped')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT shift_time_valid CHECK (ends_at > starts_at)
);

CREATE TRIGGER staff_shifts_updated_at
  BEFORE UPDATE ON staff_shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX staff_shifts_gym_id_idx       ON staff_shifts (gym_id);
CREATE INDEX staff_shifts_gym_staff_idx    ON staff_shifts (gym_id, staff_id);
CREATE INDEX staff_shifts_gym_starts_idx   ON staff_shifts (gym_id, starts_at);
CREATE INDEX staff_shifts_gym_location_idx ON staff_shifts (gym_id, location_id);

ALTER TABLE staff_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_shifts_gym_isolation ON staff_shifts
  USING (gym_id = current_setting('app.current_gym_id', TRUE)::UUID);
