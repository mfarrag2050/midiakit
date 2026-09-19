/**
 * 410 · plans.allow_urgent — بابٌ للمسار السريع.
 *
 * ── لماذا ───────────────────────────────────────────────────
 * `routes/renders/create.ts` كان يقبل `priority: 'urgent'` من **أيّ**
 * مستأجرٍ بلا فحص. المسارُ السريع مفتوحٌ للجميع مجّاناً — وما يفتحه
 * الجميعُ لا يبقى سريعاً (audit 850 + قرار المالك 2026-09-19 · الخيار أ).
 *
 * ── التصميم ────────────────────────────────────────────────
 * عمودٌ boolean على `plans`، الافتراض **`false`** (فشلٌ مغلق). لا
 * تُمنَح الميزةُ لأيّ خطّةٍ في هذه الهجرة — القرارُ للمالك بعد رؤية
 * قائمة الخطط في تقرير 410. حتى ذلك الحين، المسارُ العاجل مغلقٌ على
 * الجميع (أسلمُ من مفتوحٍ للجميع).
 *
 * ── التوسّع لاحقاً ─────────────────────────────────────────
 * `plan_overrides.allow_urgent` مدعوم تلقائيّاً عبر `pick()` في
 * `apps/api/src/config/effective-limits.ts` — لا تعديل هنا.
 *
 * ── L-59 ────────────────────────────────────────────────────
 * إضافة عمود صرفة · لا تغيير سلوك على الأعمدة القائمة · لا مسٌّ
 * لسياسات RLS. `plans.definition_hash` (A28) لا يتأثّر — الهاش على
 * `{key, name_ar, name_en}` فقط.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE plans
      ADD COLUMN allow_urgent boolean NOT NULL DEFAULT false;
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`ALTER TABLE plans DROP COLUMN IF EXISTS allow_urgent;`);
}
