/**
 * 380-FOUR-LIMITS · tenants.is_active + plans.projects_limit.
 *
 * ── لماذا ───────────────────────────────────────────────────
 * تقرير mkaudit 760 §٢-أ: أربعة رموز خطأٍ معلَنة في `errors.ts` بصفر
 * مواضع نداء — `ACCOUNT_SUSPENDED` و`PLAN_LIMIT_REACHED` (للمشاريع) اثنان
 * منها. غيابهما اليوم يعني أن حساباً موقوفاً يستطيع فعل كلّ شيء، وأنّ
 * مستأجراً على باقة تحدّه بعشرين مشروعاً يستطيع إنشاء عشرين ألفاً.
 *
 * هذه الهجرة تُضيف المفتاحين البنيويّين للفرض في طبقة API:
 *   1. `tenants.is_active boolean NOT NULL DEFAULT true` — الفرض في
 *      `plugins/auth-guard.ts`: طلب unsafe method على مستأجرٍ غير نشط
 *      يُردّ بـ`ACCOUNT_SUSPENDED` قبل بلوغ handler.
 *   2. `plans.projects_limit integer` (nullable = غير محدود) — الفرض في
 *      `routes/projects/create.ts`: `COUNT` قبل `INSERT` مقابل الحدّ.
 *
 * ── قيم البذر لـprojects_limit ──────────────────────────────
 * القيم أسفل مشتقّة من نمط `videos_per_month_limit`/`seats_limit` في
 * الباقات نفسها — نسبة `~10×videos` أو `~50×seats` تكفي لتغطية الاستعمال
 * الشرعيّ دون فتح باب انتفاخ الجداول لمستأجرٍ مسيء.
 *
 *   trial     = 10        (يوازي videos=5 بمساحةٍ للتجارب)
 *   starter   = 50        (يوازي videos=20 · seats=2)
 *   studio    = 200       (يوازي videos=100 · seats=5)
 *   agency    = 1000      (unlimited videos · seats=15)
 *   api       = NULL      (unlimited — يوازي جميع الحدود العليا)
 *
 * ── حماية L-59 ─────────────────────────────────────────────
 * لا تعديل على أعمدة موجودة · لا حذف · تغييرات إضافيّة صرفة. RLS يبقى
 * كما هو. `plans.definition_hash` (A28) لا يتأثّر — الهاش يُحسب على
 * `{key, name_ar, name_en}` فقط (راجع `check-plan-sync.mjs:72`).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    -- (1) tenants.is_active — بوّابة تعليق الحساب (§١ من 380).
    ALTER TABLE tenants
      ADD COLUMN is_active boolean NOT NULL DEFAULT true;

    CREATE INDEX tenants_is_active_idx
      ON tenants(is_active)
      WHERE is_active = false;

    -- (2) plans.projects_limit — nullable = غير محدود.
    ALTER TABLE plans
      ADD COLUMN projects_limit integer
        CHECK (projects_limit IS NULL OR projects_limit > 0);

    UPDATE plans SET projects_limit = 10   WHERE key = 'trial';
    UPDATE plans SET projects_limit = 50   WHERE key = 'starter';
    UPDATE plans SET projects_limit = 200  WHERE key = 'studio';
    UPDATE plans SET projects_limit = 1000 WHERE key = 'agency';
    -- api يبقى NULL (unlimited)
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP INDEX IF EXISTS tenants_is_active_idx;
    ALTER TABLE tenants DROP COLUMN IF EXISTS is_active;
    ALTER TABLE plans   DROP COLUMN IF EXISTS projects_limit;
  `);
}
