/**
 * Test/verification helpers لتنفيذ استعلامات ضمن معاملة بـtenant_id مضبوط.
 *
 * ليست كود تطبيق — تُستهلَك من scripts/verify-tenant-isolation.mjs
 * ومن اختبارات vitest لاحقاً. الـmiddleware الحقيقي (A7) سيبني نمطاً
 * مماثلاً على مستوى Fastify/Express hooks.
 *
 * قاعدة: كل معاملة تبدأ بـSELECT app_set_tenant(<uuid>) — بلاها،
 * سياسات RLS ترفض كل شيء (NULL = uuid → NULL → مرفوض).
 */
import { Pool, type PoolClient, type PoolConfig } from 'pg';

export type TxFn<T> = (client: PoolClient) => Promise<T>;

/**
 * ينفّذ fn داخل معاملة مع app.tenant_id مضبوط. commit عند النجاح،
 * rollback عند الفشل. المتّصل يعود إلى pool في finally.
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  fn: TxFn<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT app_set_tenant($1::uuid)', [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * ينفّذ fn داخل معاملة **بلا** ضبط app.tenant_id. مخصّص للاختبارات
 * السلبية: يجب أن يفشل الاستعلام (أو يعيد صفر صفوف) لأن RLS يرفض
 * NULL = uuid افتراضياً.
 */
export async function withoutTenant<T>(
  pool: Pool,
  fn: TxFn<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // ملاحظة: لا استدعاء لـapp_set_tenant. حتى لو أُعيدت
    // معاملة سابقة على نفس الاتصال، BEGIN تبدأ txn جديدة و SET LOCAL
    // السابق لا ينتقل. RESET لضمان أن قيمة سابقة من نفس الجلسة لا تسرّب.
    await client.query(`SELECT set_config('app.tenant_id', '', false)`);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Pool للاتصال بـapp_user — الوحيد المسموح للتطبيق.
 */
export function createAppPool(databaseUrl: string, extra: PoolConfig = {}): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 10_000,
    ...extra,
  });
}

/**
 * Pool للاتصال بـmigration_user — للـseeds والـmigrations والـfixtures
 * في الاختبارات (تجاوز RLS ليس متاحاً هنا؛ FORCE مطبَّق على migration_user
 * أيضاً — أي seed يجب أن يضبط app.tenant_id أو يستعمل سياسات مسموحة).
 */
export function createMigrationPool(databaseUrl: string, extra: PoolConfig = {}): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 2,
    idleTimeoutMillis: 10_000,
    ...extra,
  });
}
