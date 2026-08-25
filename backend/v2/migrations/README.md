# Gym SaaS — SQL Migrations

Production-ready PostgreSQL schema for a multi-tenant gym management SaaS.

## Migration order

| File | What it creates |
|------|----------------|
| `001_extensions_and_functions.sql` | pgcrypto, pg_trgm, helper functions |
| `002_platform_layer.sql` | users, gyms, gym_settings, gym_locations |
| `003_members_and_staff.sql` | members, staff + RLS |
| `004_membership_plans_and_billing.sql` | membership_plans, member_subscriptions, payments + RLS |
| `005_classes_and_bookings.sql` | class_templates, class_sessions, bookings + RLS |
| `006_checkins_and_access.sql` | access_devices, check_ins + RLS |
| `007_crm_and_communications.sql` | leads, communication_templates, automation_rules, communications, push_tokens + RLS |
| `008_pos_fitness_and_scheduling.sql` | pos_products, pos_sales, body_measurements, workout_programs, staff_shifts + RLS |
| `009_audit_and_integrations.sql` | audit_logs, integrations, api_keys, webhook_events |
| `010_analytics_and_reports.sql` | analytics_daily_snapshots, saved_reports |
| `011_seed_defaults_and_roles.sql` | provisioning trigger, helper functions, DB roles |

## Running migrations

```bash
# With psql
psql $DATABASE_URL -f migrations/001_extensions_and_functions.sql
psql $DATABASE_URL -f migrations/002_platform_layer.sql
# ... continue in order

# Or with a migration runner (recommended for production)
# node-pg-migrate, Flyway, Liquibase, or Prisma migrate
```

## Tenancy model

Every request must set the RLS context before querying:

```sql
SET LOCAL app.current_gym_id = '<gym_uuid>';
```

In Node.js / Express:

```javascript
await db.query(`SET LOCAL app.current_gym_id = $1`, [gymId]);
```

Tables **without** `gym_id` (above the tenancy boundary):
- `users` — shared auth identities
- `gyms` — tenant root
- `webhook_events` — inbound events from providers

All other tables have RLS policies enforcing `gym_id` isolation.

## Database roles

| Role | Purpose |
|------|---------|
| `app_user` | API server — RLS applies, tenant-scoped |
| `super_admin` | Platform admin — BYPASSRLS, full access |
| `reader` | Analytics / reporting jobs — read-only |

## Key design decisions

- **`users` has no `gym_id`** — a person can be a staff member at multiple gyms.
- **`audit_logs` is append-only** — guarded by RULE to block UPDATE/DELETE.
- **`webhook_events` has a unique constraint on `(provider, event_id)`** — idempotency guard for Stripe/Twilio retries.
- **`payments` has `idempotency_key`** — prevents duplicate charges from network retries.
- **`bookings` has `(gym_id, member_id, session_id)` unique constraint** — prevents double-booking.
- **`class_sessions` stores RRULE** — RFC 5545 recurrence rules, parsed in app layer.
- **`workout_programs.schedule` is JSONB** — deeply nested exercise data always read as a unit.
- **Trigram indexes on `members(name, email)`** — enables fast fuzzy search without full-text overhead.
