import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg'
import { env } from '@/config/env'
import { logger } from '@/utils/logger'

// ─── Pool ─────────────────────────────────────────────────────────────────────

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  min:              0,          // don't keep idle connections alive
  max:              5,
  idleTimeoutMillis:     10000, // release idle connections after 10s
  connectionTimeoutMillis: 10000,
  allowExitOnIdle:  true,       // let Node exit cleanly
})

pool.on('error', (err) => {
  logger.warn('Idle client error', { error: err.message })
})

// ─── Raw query (no tenant context — for platform-level tables) ────────────────
// Use for: gyms, users, webhook_events, audit_logs (super-admin)

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now()
  try {
    const result = await pool.query<T>(sql, params)
    const ms = Date.now() - start
    if (ms > 1_000) logger.warn('Slow query', { sql: sql.slice(0, 80), ms })
    return result
  } catch (err: any) {
    logger.error('Query failed', { sql: sql.slice(0, 80), error: err.message })
    throw err
  }
}

// ─── Tenant query (single query, sets RLS context first) ─────────────────────
// Use for: one-off reads inside a route that don't need a full transaction

export async function tenantQuery<T extends QueryResultRow = QueryResultRow>(
  gymId: string,
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const client = await pool.connect()
  try {
    await setTenantContext(client, gymId)
    return await client.query<T>(sql, params)
  } finally {
    client.release()
  }
}

// ─── Transaction (multiple queries, same tenant context, atomic) ──────────────
// Use for: bookings, billing charges, subscription changes — anything
// where partial writes must not persist on failure

export async function withTransaction<T>(
  gymId: string,
  fn: (db: TenantClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await setTenantContext(client, gymId)
    await client.query('BEGIN')
    const result = await fn(new TenantClient(client, gymId))
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

// ─── Sets RLS context on a client ────────────────────────────────────────────
// set_config with false = session-level (lasts until connection returns to pool)
// Inside a transaction, ROLLBACK does NOT undo set_config — so we always set it
// at connection checkout time, not inside BEGIN/COMMIT

async function setTenantContext(client: PoolClient, gymId: string): Promise<void> {
  await client.query(`SELECT set_config('app.current_gym_id', $1, false)`, [gymId])
}

// ─── TenantClient — thin wrapper passed into withTransaction callbacks ────────

export class TenantClient {
  constructor(
    private readonly client: PoolClient,
    public readonly gymId: string
  ) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return this.client.query<T>(sql, params)
  }

  // Returns first row or null — avoids boilerplate result.rows[0] everywhere
  async one<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<T | null> {
    const result = await this.client.query<T>(sql, params)
    return result.rows[0] ?? null
  }

  // Returns all rows
  async many<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<T[]> {
    const result = await this.client.query<T>(sql, params)
    return result.rows
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────

export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1')
    return true
  } catch {
    return false
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

export async function closeDb(): Promise<void> {
  await pool.end()
  logger.info('DB pool closed')
}