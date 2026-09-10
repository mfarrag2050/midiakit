/**
 * LIMITS-1 §2 — Sweep الأصول اليتيمة (safe deletion — mark ثم purge).
 *
 * قرارات المالك 2026-09-07:
 *   • علامة أولاً، حذف ثانياً (نافذة استرداد أسبوع)
 *   • 24 ساعة نافذة أمان قبل التعليم (أصل جديد قد يُربَط لاحقاً)
 *   • storage adapter وحده يحذف من التخزين (لا S3 مباشر)
 *
 * تعريف اليتيم:
 *   finalized_at IS NOT NULL
 *   AND created_at < now() - '24 hours'
 *   AND NOT EXISTS (أيّ brand_kits.config يذكر أصله)
 *   AND NOT EXISTS (أيّ renders.brand_snapshot يذكر أصله)
 *
 * الاستدعاء: من `alerts-cron` worker (BullMQ repeat يومياً 03:00 UTC)
 * أو يدوياً في الاختبار عبر `runOrphanSweep(pool, tenantId?)`.
 *
 * التنفيذ per-tenant (SET LOCAL app.tenant_id) — RLS يفرض العزل حتى لو
 * كان الاستدعاء من نفس العملية.
 */
import type { Pool } from 'pg';
import { getStorage } from '../storage/index.js';

export interface SweepResult {
  readonly tenantsProcessed: number;
  readonly assetsMarked: number;
  readonly assetsPurged: number;
  readonly storageErrors: number;
}

/**
 * Sweep لكل مستأجرين النظام (يستدعيها الـcron). في الاختبار نستطيع
 * تمرير tenantId لعزل الأثر على واحد.
 */
export async function runOrphanSweep(
  migPool: Pool,
  onlyTenantId?: string,
): Promise<SweepResult> {
  const result = { tenantsProcessed: 0, assetsMarked: 0, assetsPurged: 0, storageErrors: 0 };

  // نجلب قائمة المستأجرين (migration_user يعبر RLS على tenants عبر
  // migration_user_all policy — راجع A2).
  const tenants = onlyTenantId
    ? { rows: [{ id: onlyTenantId }] }
    : await migPool.query<{ id: string }>(`SELECT id FROM tenants ORDER BY id`);

  for (const { id: tenantId } of tenants.rows) {
    const c = await migPool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT app_set_tenant($1::uuid)', [tenantId]);

      // ── STEP 1: mark ─────────────────────────────────
      // نبني مجموعة linkedAssetIds من brand_kits.config و renders.brand_snapshot
      // عبر regex على النصّ الكامل: أيّ ظهور لـ`"assetId":"<uuid>"` في jsonb.
      // regex أبسط وأوثق من jsonb_path_query لأن هيكل brand-kit عميق ومتغيّر.
      const marked = await c.query<{ id: string }>(`
        WITH linked_assets AS (
          SELECT DISTINCT (regexp_matches(bk.config::text, '"assetId":\\s*"([0-9a-f-]{36})"', 'g'))[1]::uuid AS asset_id
          FROM brand_kits bk WHERE bk.tenant_id = $1
          UNION
          SELECT DISTINCT (regexp_matches(r.brand_snapshot::text, '"assetId":\\s*"([0-9a-f-]{36})"', 'g'))[1]::uuid AS asset_id
          FROM renders r WHERE r.tenant_id = $1
        )
        UPDATE assets
        SET orphan_marked_at = now()
        WHERE tenant_id = $1
          AND finalized_at IS NOT NULL
          AND created_at < now() - interval '24 hours'
          AND orphan_marked_at IS NULL
          AND id NOT IN (SELECT asset_id FROM linked_assets WHERE asset_id IS NOT NULL)
        RETURNING id
      `, [tenantId]);
      result.assetsMarked += marked.rowCount ?? 0;

      // ── STEP 2: purge (marked > 7 days) ──────────────
      const toPurge = await c.query<{ id: string; storage_key: string }>(`
        SELECT id, storage_key FROM assets
        WHERE tenant_id = $1
          AND orphan_marked_at IS NOT NULL
          AND orphan_marked_at < now() - interval '7 days'
      `, [tenantId]);

      const storage = getStorage();
      for (const row of toPurge.rows) {
        try {
          await storage.deleteObject(row.storage_key);
        } catch (err) {
          // "not found" مقبول — الهدف: الملف غير موجود بعد الحذف. سواء كان
          // مُفقوداً أصلاً (تسريب سابق أو حذف مزدوج) أو حذفه adapter بنجاح.
          const msg = (err as Error).message ?? '';
          if (!/not found|not exist|NoSuchKey|NotFound/i.test(msg)) {
            result.storageErrors++;
            console.warn(`[orphan-sweep] storage delete failed for asset ${row.id}: ${msg}`);
            continue;
          }
        }
        await c.query(`DELETE FROM assets WHERE id = $1`, [row.id]);
        result.assetsPurged++;
      }

      await c.query('COMMIT');
      result.tenantsProcessed++;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => {});
      console.error(`[orphan-sweep] tenant ${tenantId} failed: ${(err as Error).message}`);
    } finally { c.release(); }
  }

  return result;
}
