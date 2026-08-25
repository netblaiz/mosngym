// =============================================================================
// Bootstrap script
// Run once to set up your first super-admin and gym tenant
// Usage: npx tsx scripts/bootstrap.ts
// =============================================================================

import { env } from '../src/config/env'

import { Pool } from 'pg'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const pool = new Pool({ connectionString: env.DATABASE_URL })

async function bootstrap() {
  //console.log(env.DATABASE_URL)
  console.log('\nMosn Gym Bootstrap\n')


  // ── 1. Create super-admin user ─────────────────────────────────────────────
  const adminEmail    = 'findxconcepts@gmail.com'
  const adminPassword = 'Episcopal1@'
  const adminHash     = await bcrypt.hash(adminPassword, 12)

  const existing = await pool.query(
    `SELECT id FROM users WHERE email = $1`, [adminEmail]
  )

  let adminId: string

  if (existing.rows[0]) {
    adminId = existing.rows[0].id
    console.log('Super-admin already exists:', adminEmail)
  } else {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, email_verified)
       VALUES ($1, $2, TRUE) RETURNING id`,
      [adminEmail, adminHash]
    )
    adminId = result.rows[0].id
    console.log('Super-admin created:', adminEmail)
  }

  // ── 2. Generate super-admin JWT ────────────────────────────────────────────
  const superAdminToken = jwt.sign(
    {
      sub:   adminId,
      gymId: 'findxconcepts',  // dummy gymId for super-admin
      role:  'super_admin',
      type:  'access',
    },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '7d' }  // long expiry for bootstrapping
  )

  console.log('\nSuper-admin token (valid 7 days):')
  console.log(superAdminToken)

  // ── 3. Create first gym tenant ─────────────────────────────────────────────
  const gymSlug = 'benfit-lagos'

  const existingGym = await pool.query(
    `SELECT id FROM gyms WHERE slug = $1`, [gymSlug]
  )

  if (existingGym.rows[0]) {
    console.log('\nGym already exists:', gymSlug)
    await printGymToken(existingGym.rows[0].id, pool)
    await pool.end()
    return
  }

  const ownerEmail = 'owner@benfit.com'
  const ownerHash  = await bcrypt.hash('Admin12345', 12)

  // Create owner user
  const ownerResult = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, email_verified)
     VALUES ($1, $2, TRUE)
     ON CONFLICT (email) DO UPDATE SET email_verified = TRUE
     RETURNING id`,
    [ownerEmail, ownerHash]
  )
  const ownerId = ownerResult.rows[0].id

  // Create gym (provision_new_gym trigger fires automatically)
  const gymResult = await pool.query<{ id: string }>(
    `INSERT INTO gyms
       (name, slug, owner_user_id, country, currency, timezone,
        subscription_plan, subscription_status, trial_ends_at)
     VALUES ($1,$2,$3,'NG','NGN','Africa/Lagos','trial','active', NOW() + INTERVAL '14 days')
     RETURNING id`,
    ['FitZone Lagos', gymSlug, ownerId]
  )
  const gymId = gymResult.rows[0].id

  // Create owner staff record
  await pool.query(
    `INSERT INTO staff (gym_id, user_id, role, is_active, accepted_at)
     VALUES ($1,$2,'owner',TRUE,NOW())`,
    [gymId, ownerId]
  )

  console.log('\nGym created: Benfit Lagos')
  console.log('   Gym ID:       ', gymId)
  console.log('   Owner email:  ', ownerEmail)
  console.log('   Owner password: Admin12345')

  await printGymToken(gymId, pool)

  // ── 4. Print summary ───────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────')
  console.log('📋  Test credentials summary:')
  console.log('─────────────────────────────────────────')
  console.log('Super-admin:')
  console.log('  Email:    ', adminEmail)
  console.log('  Password: ', adminPassword)
  console.log('\nGym owner (Benfit Lagos):')
  console.log('  Email:    ', ownerEmail)
  console.log('  Password:  Admin12345')
  console.log('  Gym slug:  benfit-lagos')
  console.log('\nLogin endpoint:')
  console.log('  POST http://localhost:3000/api/auth/login')
  console.log('  Body: { "email": "owner@benfit.com", "password": "Admin12345", "gymSlug": "benfit-lagos" }')
  console.log('─────────────────────────────────────────\n')

  await pool.end()
}

async function printGymToken(gymId: string, pool: Pool) {
  // Get owner staff record
  const staffResult = await pool.query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM staff WHERE gym_id = $1 AND role = 'owner' LIMIT 1`,
    [gymId]
  )
  const staff = staffResult.rows[0]
  if (!staff) return

  const gymToken = jwt.sign(
    {
      sub:     staff.user_id,
      gymId,
      staffId: staff.id,
      role:    'owner',
      type:    'access',
    },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '7d' }
  )

  console.log('\n🔑  Gym owner token (valid 7 days):')
  console.log(gymToken)
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err.message)
  process.exit(1)
})