/**
 * _AMEND-231-MIGRATION-NOOP — هجرة تتحقّق من أثرها.
 *
 * ── لماذا هجرة ثانية على نفس الموضوع؟ ──────────
 * الهجرة السابقة (`20260912030000_templates-resync-hash`) سُجِّلت مطبَّقة على
 * قاعدة `mk` لكنّ hash breaking بقي القديم. السبب غير مقطوع (mk قال:
 * migration_user قادر على UPDATE يدوياً · قدرة موجودة · أثر غائب).
 *
 * **بغضّ النظر عن السبب**: هذه الهجرة تُعيد تطبيق نفس UPDATEs · وتتحقّق
 * بـSELECT بعدها. إن الحالة النهائيّة ليست المُتوقَّعة ⇒ RAISE EXCEPTION ⇒
 * الهجرة تُرجَع ⇒ لا تُسجَّل مطبَّقة ⇒ الفشل ظاهر لا صامت.
 *
 * ── النمط الجديد (يُتَّبع في كل هجرة بيانات) ──────
 * 1. تطبيق التغيير (UPDATE/INSERT/DELETE).
 * 2. VERIFY: `DO $$ ... IF (state != expected) THEN RAISE EXCEPTION $$`.
 * 3. الفشل يُرجِع الـtx كاملاً · pgmigrations لا يُنسَخ.
 *
 * عدّاد الصفوف وحده لا يكفي: UPDATE 0 قد يكون صحيحاً (لا انحراف) أو
 * كارثيّاً (WHERE لا يطابق). التأكيد على الحالة النهائيّة لا العدد.
 *
 * ── idempotent ──────────────────────────────────
 * إن كانت الحالة صحيحة قبل الهجرة (dev environment مثلاً · قوالب متطابقة)
 * · UPDATE 0 rows · verify ✓ · migration succeeds trivially.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const TEMPLATE_HASHES: Record<string, string> = {
  '@pf-mediakit/templates/breaking.json':      '33757216713783b67077b46e5300c32d8982a3415b9a4eb0916e3346d61080d3',
  '@pf-mediakit/templates/card-bottom.json':   'dc2d6aeff939d30638f1e56b55c99e6a8f744f57ddc6f767b8df4d62a04def40',
  '@pf-mediakit/templates/card-centered.json': '5143a7efd92076d44350af601ee9039183f4ec52a1efd8abfd38e1853c1f2133',
  '@pf-mediakit/templates/card-kicker.json':   '0e2d0e936cab296a9a90c2b70f7ab56b3c50c2cdd32792bbbaeec7f53303b816',
  '@pf-mediakit/templates/plain.json':         '62fa46fe19cd08ad15cda5e4f464704578e7d36d367ad5bbfe182312eb007761',
  '@pf-mediakit/templates/reel.json':          '3829142dc97f51c20f569357240dac0f6bdc74f6c3aa6c89c0ff172ac0ef2bed',
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  // (١) نضمن policy موجودة (إن سبق الإنشاء · لا نُعيده — DROP+CREATE
  // idempotent). CREATE POLICY IF NOT EXISTS غير مدعوم في PG < 15.
  pgm.sql(`DROP POLICY IF EXISTS templates_migration_user_all ON templates`);
  pgm.sql(`
    CREATE POLICY templates_migration_user_all ON templates
      AS PERMISSIVE FOR ALL TO migration_user
      USING (true) WITH CHECK (true)
  `);

  // (٢) apply · نفس UPDATE من 20260912030000 · idempotent
  for (const [sourceRef, hash] of Object.entries(TEMPLATE_HASHES)) {
    pgm.sql(`
      UPDATE templates
      SET definition_hash = '${hash}'
      WHERE scope = 'global'
        AND source_ref = '${sourceRef}'
        AND definition_hash <> '${hash}'
    `);
  }

  // (٣) VERIFY · نقرأ الحالة النهائيّة · نفشل إن لم تُطابق المُتوقَّع.
  // بناء conditions: صفّ متبقٍّ hash خاطئ ⇒ فشل.
  const staleCondition = Object.entries(TEMPLATE_HASHES)
    .map(([ref, hash]) => `(source_ref = '${ref}' AND definition_hash <> '${hash}')`)
    .join(' OR ');
  pgm.sql(`
    DO $$
    DECLARE
      stale_count int;
      stale_row RECORD;
      stale_names text := '';
    BEGIN
      SELECT count(*) INTO stale_count
      FROM templates
      WHERE scope = 'global' AND (${staleCondition});

      IF stale_count > 0 THEN
        FOR stale_row IN
          SELECT source_ref, substring(definition_hash for 12) AS hash_prefix
          FROM templates WHERE scope = 'global' AND (${staleCondition})
        LOOP
          stale_names := stale_names || '  ' || stale_row.source_ref || ' (hash=' || stale_row.hash_prefix || ')' || chr(10);
        END LOOP;
        RAISE EXCEPTION E'MIGRATION_VERIFY_FAILED: % قوالب لا تزال بـhash خاطئ · لن تُسجَّل مطبَّقة:\\n%',
          stale_count, stale_names;
      END IF;
    END $$
  `);
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // لا reverse — الحالة الصحيحة لا تُعاد إلى خاطئة.
}
