/**
 * 160-SNAPSHOT-REPAIR — الحرس الذي يمنع لقطة كاذبة في المستقبل.
 *
 * ── العطب الذي نُغلقه ──────────────────────────────
 * 143 كشف أنّ 386 صفّاً في `renders` حالتها `succeeded` لكنّ
 * `brand_snapshot` فيها ناقص (فارغ أو logo وحده أو بلا colors/fonts).
 * كلّها بذور verify-* scripts أدخلت مباشرة بلا مرور بمسار الإنتاج ·
 * لكنّ الاحتمال البنيويّ باقٍ: أيّ INSERT/UPDATE مستقبليّ يستطيع
 * كتابة نفس اللقطة الكاذبة.
 *
 * ── الشكل ──────────────────────────────────────────
 * 1. **إضافة 'invalid' إلى renders_status_check** — لوسم اللقطات
 *    الماضية المكسورة (شرط 160 §٢: «تُوسَم invalid · لا تُحذَف»).
 * 2. **trigger BEFORE INSERT OR UPDATE على renders**:
 *    - إن `status = 'succeeded'` و `brand_snapshot` بلا `fonts` أو
 *      بلا `colors` ⇒ RAISE بـSQLSTATE '54K01' مع رمز
 *      `RENDER_SNAPSHOT_INCOMPLETE`.
 *    - error-handler في apps/api يترجم SQLSTATE إلى 422 ApiError.
 * 3. **الحرس في موضع واحد** (شرط 160 §١): DB · لا في المستدعي.
 *    كل INSERT/UPDATE — من verify script · من api-worker · من endpoint —
 *    يمرّ به.
 *
 * ── ما لا يشمله هذا الحرس ────────────────────────────
 * - status='queued'/'running' — لا فحص (اللقطة قد تُكمَل لاحقاً).
 * - status='failed'/'canceled'/'invalid' — لا فحص (حالات فشل معلَنة).
 * - `size='x'` · `template_snapshot='{}'` — علل منفصلة (تذاكر مستقلّة).
 *
 * ── L-46 (اختبار حياة · شرط 160 §٣) ────────────────
 *   RED: INSERT/UPDATE renders SET status='succeeded' بـsnapshot ناقص
 *        ⇒ 422 RENDER_SNAPSHOT_INCOMPLETE (رمز مسمّى).
 *   GREEN: نفس الطلب بـsnapshot كامل ⇒ 200.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── (1) إضافة 'invalid' إلى status enum ──────────────
  pgm.sql(`ALTER TABLE renders DROP CONSTRAINT renders_status_check`);
  pgm.sql(`
    ALTER TABLE renders ADD CONSTRAINT renders_status_check
      CHECK (status = ANY (ARRAY['queued', 'running', 'succeeded', 'failed', 'canceled', 'cancelling', 'invalid']))
  `);

  // ── (2) trigger BEFORE INSERT OR UPDATE على renders ──
  // يفحص اكتمال brand_snapshot عند التحوّل إلى/الكتابة بـsucceeded.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION renders_snapshot_guard() RETURNS trigger AS $$
    BEGIN
      IF NEW.status = 'succeeded' THEN
        IF NEW.brand_snapshot IS NULL
           OR NOT (NEW.brand_snapshot ? 'fonts')
           OR NOT (NEW.brand_snapshot ? 'colors') THEN
          RAISE EXCEPTION 'RENDER_SNAPSHOT_INCOMPLETE: brand_snapshot لناجح ينقصه fonts أو colors'
            USING ERRCODE = '54K01';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  pgm.sql(`
    CREATE TRIGGER renders_snapshot_guard_trg
      BEFORE INSERT OR UPDATE ON renders
      FOR EACH ROW EXECUTE FUNCTION renders_snapshot_guard()
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TRIGGER IF EXISTS renders_snapshot_guard_trg ON renders`);
  pgm.sql(`DROP FUNCTION IF EXISTS renders_snapshot_guard()`);
  pgm.sql(`ALTER TABLE renders DROP CONSTRAINT renders_status_check`);
  pgm.sql(`
    ALTER TABLE renders ADD CONSTRAINT renders_status_check
      CHECK (status = ANY (ARRAY['queued', 'running', 'succeeded', 'failed', 'canceled', 'cancelling']))
  `);
}
