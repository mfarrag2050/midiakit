/**
 * _AMEND-100-TEMPLATE-HASH + 230-TEMPLATE-DRIFT-GATE — إعادة مزامنة `definition_hash`.
 *
 * ── السبب ────────────────────────────────────────
 * `aa6ade2` (99-SCRIM-CONTRAST · 2026-09-11) غيّر `layer[1].opacity` في
 * `breaking.json` من 0.72 إلى 0.86 بلا هجرة تُحدِّث DB. `check:template-sync`
 * كان يسكت (142-SKIP-IS-NOT-PASS كشف). بعد commit 232e464 (silent-skip →
 * fail loud) `mk` رأى الانحراف عند دمج feat/api في main.
 *
 * ── لماذا literals لا readFileSync ───────────────
 * قرار 230-TEMPLATE-DRIFT-GATE: hash يجب أن يظهر string literal في
 * migration ليُلتقَط بـ`check-template-drift.mjs` (grep على migrations).
 * `readFileSync` diffère hash إلى runtime · check يبقى «unknown» عليه.
 *
 * ── منطق التحديث المستقبليّ (deve أضاف قالباً جديداً أو غيّر واحداً) ──
 *   1. عدّل الملفّ في `packages/templates/src/templates/`.
 *   2. حدّث `packages/db/template-hashes.json` بالـhash الجديد.
 *   3. اكتب **migration جديد** (لا تعدّل هذا) يحمل UPDATE بالـhash literal.
 * الفاحص `check-template-drift` يمنع التنسيق الخاطئ.
 *
 * ── ما تفعله هذه الهجرة ─────────────────────────
 * 1. تُضيف `templates_migration_user_all` policy — بلا هذا UPDATE على
 *    scope='global' يمرّ بلا affect (templates_update يشترط scope='tenant').
 * 2. تُحدِّث `definition_hash` لكل قالب بالـhash literal الحاليّ.
 *    idempotent — WHERE `<>` يفرز الصفوف المُنحرِفة.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

// hashes literal (mirror packages/db/template-hashes.json — source of truth).
// تحديث هنا يجب أن يصاحب تحديث المنيفست + الملفّ نفسه (شرط 230).
const TEMPLATE_HASHES: Record<string, string> = {
  '@pf-mediakit/templates/breaking.json':      '33757216713783b67077b46e5300c32d8982a3415b9a4eb0916e3346d61080d3',
  '@pf-mediakit/templates/card-bottom.json':   'dc2d6aeff939d30638f1e56b55c99e6a8f744f57ddc6f767b8df4d62a04def40',
  '@pf-mediakit/templates/card-centered.json': '5143a7efd92076d44350af601ee9039183f4ec52a1efd8abfd38e1853c1f2133',
  '@pf-mediakit/templates/card-kicker.json':   '0e2d0e936cab296a9a90c2b70f7ab56b3c50c2cdd32792bbbaeec7f53303b816',
  '@pf-mediakit/templates/plain.json':         '62fa46fe19cd08ad15cda5e4f464704578e7d36d367ad5bbfe182312eb007761',
  '@pf-mediakit/templates/reel.json':          '3829142dc97f51c20f569357240dac0f6bdc74f6c3aa6c89c0ff172ac0ef2bed',
};

export async function up(pgm: MigrationBuilder): Promise<void> {
  // نُضيف policy · idempotent (IF NOT EXISTS غير مدعومة في CREATE POLICY ·
  // لكن migration يشتغل مرّة · pgmigrations يمنع re-run).
  pgm.sql(`
    CREATE POLICY templates_migration_user_all ON templates
      AS PERMISSIVE FOR ALL TO migration_user
      USING (true) WITH CHECK (true)
  `);

  for (const [sourceRef, hash] of Object.entries(TEMPLATE_HASHES)) {
    pgm.sql(`
      UPDATE templates
      SET definition_hash = '${hash}'
      WHERE scope = 'global'
        AND source_ref = '${sourceRef}'
        AND definition_hash <> '${hash}'
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP POLICY IF EXISTS templates_migration_user_all ON templates`);
}
