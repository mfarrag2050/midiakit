/**
 * A13 — Templates: بذر عام + سياسات مفصَّلة + قيود تفرّد + soft delete.
 *
 * ────────────────────────────────────────────────────────────────
 * ** النمط الموحَّد للبيانات المرجعية العامة (ADR-012 · نمط A26) **
 * ────────────────────────────────────────────────────────────────
 * `templates` و `plans` (لاحقاً A26) بيانات مرجعية عامة: يقرؤها كل
 * مستأجر، ولا يملكها أحد. السياسة الواحدة `tenant_id = app.tenant_id`
 * تحجب الصفوف العامة (tenant_id IS NULL) عن الجميع لأن NULL != NULL
 * (L-61). هذه الهجرة تُرسي **نمطاً قابلاً لإعادة الاستعمال**، ليس
 * حلاً موضعياً — A26 يعيد استعماله لجدول plans حرفياً.
 *
 * **الأربع سياسات (بدل الواحدة):**
 *   SELECT — يُرى العام (scope='global') والخاص بالمستأجر
 *   INSERT — يقبل خاصاً بمستأجر ↦ WITH CHECK (لا USING على INSERT)
 *          — يقبل عاماً من migration_user (بذر واستدامة، نطاق ضيّق)
 *   UPDATE — يقبل خاصاً بمستأجر ↦ USING + WITH CHECK (L-58)
 *   DELETE — يقبل خاصاً بمستأجر ↦ USING فقط
 *
 * **رفض التعديل على العام يُنتَج 403 من التطبيق** لا 404 من صفر
 * صفوف — الفرق الدلالي بين «لا يوجد» و «موجود ومحمي» (L-61).
 * السياسة الرباعية طبقة ثانية: حتى لو سقط فحص التطبيق، RLS تمنع.
 *
 * ────────────────────────────────────────────────────────────────
 * ** الأعمدة الجديدة **
 * ────────────────────────────────────────────────────────────────
 *   source_ref       — للعام: `@pf-mediakit/templates/<file>.json`.
 *                     للخاص: NULL (الأصل من العميل، لا حزمة).
 *   definition_hash  — sha256 canonical JSON. للعام: يحرسه
 *                     check-template-sync — الملف والصف يتطابقان.
 *                     للخاص: NULL (لا مصدر ملف).
 *   deleted_at       — soft delete. المحذوف لا يظهر في GET ولا يُحتسب
 *                     في التسعير. `RESTRICT` على FK يحمي من الحذف
 *                     الصلب أصلاً، والناعم يحفظ التاريخ للتصديرات.
 *
 * CHECK templates_global_has_source: global يفرض وجود source_ref +
 * definition_hash. tenant يفرض NULL في كليهما (لا خلط أصول).
 *
 * ────────────────────────────────────────────────────────────────
 * ** التفرّد — L-62 (NULL في tenant_id مقصود للعام) **
 * ────────────────────────────────────────────────────────────────
 *   UNIQUE (name)            WHERE scope='global'
 *   UNIQUE (tenant_id, name) WHERE scope='tenant' AND deleted_at IS NULL
 *
 * (name, deleted_at NULL) يسمح بحذف قالب ثم إنشاء واحد بنفس الاسم.
 *
 * ────────────────────────────────────────────────────────────────
 * ** البذر **
 * ────────────────────────────────────────────────────────────────
 * يُنفَّذ داخل الهجرة نفسها — dev بعد db:up مباشرة يجد الستة العامة
 * جاهزة. الملفات تُقرأ من `packages/templates/src/templates/` وقت
 * تشغيل الهجرة (لا وقت الاستيراد — تلتقط أحدث حالة).
 *
 * canonical hash = sha256(JSON.stringify(sortKeysDeep(obj))) — مستقلّ
 * عن تنسيق الملف (المسافات · ترتيب المفاتيح). التنسيق لا يفشل الحارس.
 *
 * INSERT يمرّ عبر سياسة templates_insert المخصَّصة لـmigration_user،
 * لا عبر SET row_security off — لا bypass، بل سياسة صريحة النطاق.
 */
import type { MigrationBuilder } from 'node-pg-migrate';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const shorthands = undefined;

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, '../../templates/src/templates');

/** ترتيب مفاتيح recursive لبصمة مستقلّة عن التنسيق. */
function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

function canonicalHash(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(obj))).digest('hex');
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── الأعمدة ──────────────────────────────────
  pgm.sql(`
    ALTER TABLE templates
      ADD COLUMN source_ref      text,
      ADD COLUMN definition_hash text,
      ADD COLUMN deleted_at      timestamptz
  `);

  pgm.sql(`
    ALTER TABLE templates ADD CONSTRAINT templates_global_has_source CHECK (
      (scope = 'global' AND source_ref IS NOT NULL AND definition_hash IS NOT NULL)
      OR
      (scope = 'tenant' AND source_ref IS NULL AND definition_hash IS NULL)
    )
  `);

  // ── السياسات: الأربع محل الواحدة ─────────────
  pgm.sql(`DROP POLICY templates_tenant_isolation ON templates`);

  // SELECT — العام لكل، الخاص لصاحبه
  pgm.sql(`
    CREATE POLICY templates_select ON templates
      FOR SELECT
      USING (
        scope = 'global'
        OR tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  `);

  // INSERT — الخاص للمستأجر، العام لـmigration_user فقط (بذر)
  pgm.sql(`
    CREATE POLICY templates_insert ON templates
      FOR INSERT
      WITH CHECK (
        (scope = 'tenant' AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        OR
        (scope = 'global' AND current_user = 'migration_user')
      )
  `);

  // UPDATE — الخاص فقط، USING + WITH CHECK كلاهما (L-58)
  pgm.sql(`
    CREATE POLICY templates_update ON templates
      FOR UPDATE
      USING (
        scope = 'tenant'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
      WITH CHECK (
        scope = 'tenant'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  `);

  // DELETE — الخاص فقط
  pgm.sql(`
    CREATE POLICY templates_delete ON templates
      FOR DELETE
      USING (
        scope = 'tenant'
        AND tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
      )
  `);

  // ── التفرّد ──────────────────────────────────
  pgm.sql(`CREATE UNIQUE INDEX templates_name_global ON templates(name) WHERE scope = 'global'`);
  pgm.sql(`CREATE UNIQUE INDEX templates_name_tenant ON templates(tenant_id, name) WHERE scope = 'tenant' AND deleted_at IS NULL`);

  // ── البذر ────────────────────────────────────
  const files = readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf-8')) as {
      name: string; kind: string;
    };
    const hash = canonicalHash(raw);
    const sourceRef = `@pf-mediakit/templates/${file}`;

    pgm.sql(`
      INSERT INTO templates (scope, tenant_id, kind, name, definition, source_ref, definition_hash)
      VALUES ('global', NULL, $$${raw.kind}$$, $$${raw.name.replace(/\$/g, '\\$')}$$,
              $$${JSON.stringify(raw).replace(/\$/g, '\\$')}$$::jsonb,
              $$${sourceRef}$$, $$${hash}$$)
      ON CONFLICT DO NOTHING
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DELETE FROM templates WHERE scope = 'global'`);
  pgm.sql(`DROP INDEX IF EXISTS templates_name_tenant`);
  pgm.sql(`DROP INDEX IF EXISTS templates_name_global`);
  pgm.sql(`DROP POLICY IF EXISTS templates_delete ON templates`);
  pgm.sql(`DROP POLICY IF EXISTS templates_update ON templates`);
  pgm.sql(`DROP POLICY IF EXISTS templates_insert ON templates`);
  pgm.sql(`DROP POLICY IF EXISTS templates_select ON templates`);
  pgm.sql(`
    CREATE POLICY templates_tenant_isolation ON templates
      FOR ALL
      USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  `);
  pgm.sql(`ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_global_has_source`);
  pgm.sql(`ALTER TABLE templates DROP COLUMN IF EXISTS deleted_at`);
  pgm.sql(`ALTER TABLE templates DROP COLUMN IF EXISTS definition_hash`);
  pgm.sql(`ALTER TABLE templates DROP COLUMN IF EXISTS source_ref`);
}
