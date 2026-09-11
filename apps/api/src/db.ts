/**
 * db — pg.Pool للاتصال بـapp_user حصراً.
 *
 * لا يتّصل بـpostgres أو migration_user من التطبيق. الاستعلامات
 * تجري داخل معاملة يفتحها tenant-hook (A7) مع SET LOCAL app.tenant_id.
 * الاستعلامات خارج المعاملة (أو من دون hook) مرفوضة بـRLS
 * (NULL::uuid = tenant_id → NULL → مرفوض).
 */
import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

let pool: DbPool | null = null;

export function getPool(): DbPool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.DATABASE_URL_APP,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      // اتصال في الـPool رمى خطأ خارج معاملة — نُسجّل ونستمر (Pool يعزل).
      console.error('[db] pool client error:', err.message);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ── A27 — Platform pool (control_plane_user) ─────────────
// اتصال منفصل لمسارات المنصّة. control_plane_user يعبر RLS بسياسات
// صريحة (لا BYPASSRLS). لا SET LOCAL app.tenant_id (يرى الكلّ).
let platformPool: DbPool | null = null;

export function getPlatformPool(): DbPool {
  if (!platformPool) {
    platformPool = new Pool({
      connectionString: config.DATABASE_URL_PLATFORM,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    platformPool.on('error', (err) => {
      console.error('[db-platform] pool client error:', err.message);
    });
  }
  return platformPool;
}

export async function closePlatformPool(): Promise<void> {
  if (platformPool) {
    await platformPool.end();
    platformPool = null;
  }
}
