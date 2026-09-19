/**
 * 420 · plans.storage_quota_bytes — الفرضُ المفقود لـSTORAGE_QUOTA_EXCEEDED.
 *
 * ── لماذا ───────────────────────────────────────────────────
 * audit 850 كشف أنّ `STORAGE_QUOTA_EXCEEDED` رمزٌ معلَنٌ في `errors.ts`
 * بلا مسارٍ يفرضه. كلّ ملفٍّ منفرد يُفحَص بـ`STORAGE_MAX_SIZE_BYTES`،
 * لكنّ المجموعَ المتراكم لا يُحسَب — ألفُ ملفٍّ صغيرٍ تعبر جميعاً.
 *
 * ── التصميم ────────────────────────────────────────────────
 * عمود `plans.storage_quota_bytes bigint NULL` — nullable = غير محدود
 * (نفس دلالة `videos_per_month_limit` و`brand_kits_limit`).
 *
 * **لا قيَم مضبوطة في هذه الهجرة.** حتى يقرّر المالك، كلّ الخطط تبقى
 * على `NULL` = «بلا حصّة». الفرضُ الحيّ في `upload-url.ts` يعمل فقط حين
 * تكون القيمة != NULL، فلا كسر لخطّة قائمة.
 *
 * ── التوسّع لاحقاً ─────────────────────────────────────────
 * `plan_overrides.storage_quota_bytes` مدعوم تلقائيّاً عبر `pick()` في
 * `effective-limits.ts` — لا تعديل هنا.
 *
 * ── L-59 ────────────────────────────────────────────────────
 * إضافة عمود صرفة · لا مسّ لسياسات RLS · لا trigger. definition_hash
 * (A28) لا يتأثّر (هاش على {key, name_ar, name_en}).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE plans
      ADD COLUMN storage_quota_bytes bigint
        CHECK (storage_quota_bytes IS NULL OR storage_quota_bytes > 0);
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE plans DROP COLUMN IF EXISTS storage_quota_bytes;`);
}
