/**
 * _AMEND-100-TEMPLATE-HASH — إعادة مزامنة `definition_hash` مع بايتات الملفّ الحاليّة.
 *
 * ── السبب ────────────────────────────────────────
 * `aa6ade2` (99-SCRIM-CONTRAST · 2026-09-11) غيّر `layer[1].opacity` في
 * `breaking.json` من 0.72 إلى 0.86 بلا هجرة تُحدِّث DB. `check:template-sync`
 * كان يسكت (142-SKIP-IS-NOT-PASS كشف). بعد commit 232e464 (silent-skip →
 * fail loud) `mk` رأى الانحراف عند دمج feat/api في main.
 *
 * ── ما تفعله هذه الهجرة ─────────────────────────
 * تقرأ ملفّات القوالب الحاليّة · تحسب canonical hash · UPDATE على كل صفّ
 * scope='global' حيث `definition_hash` ≠ الحاليّ. **آمنة التكرار**:
 *   • قيمة صحيحة أصلاً ⇒ UPDATE بنفس القيمة (لا تغيير فعليّ لأنّ WHERE يفرز).
 *   • انحراف ⇒ يُصلَح.
 *
 * ── نمط الحساب ──────────────────────────────────
 * نفس دالّة `canonicalHash` المُستعملة في:
 *   • `packages/db/scripts/check-template-sync.mjs:43-45`
 *   • `packages/db/migrations/20260906120000_templates-a13.ts:64-67`
 *
 * ── لا لمس ملفّات القوالب ────────────────────────
 * `breaking.json` نفسه لا يُعدَّل — قرار البصريّ مُعلَن (99-SCRIM-CONTRAST)
 * واللقطات تعتمده. الهجرة تُصحّح DB لا الملفّ.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const __dirname = dirname(fileURLToPath(import.meta.url));
// packages/db/migrations/ → packages/templates/src/templates
const TEMPLATES_DIR = join(__dirname, '..', '..', 'templates', 'src', 'templates');

function sortKeysDeep<T>(v: T): T {
  if (Array.isArray(v)) return (v as unknown[]).map((x) => sortKeysDeep(x)) as unknown as T;
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    const rec = v as Record<string, unknown>;
    for (const k of Object.keys(rec).sort()) out[k] = sortKeysDeep(rec[k]);
    return out as unknown as T;
  }
  return v;
}

function canonicalHash(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(sortKeysDeep(obj))).digest('hex');
}

export async function up(pgm: MigrationBuilder): Promise<void> {
  // نُضيف policy تسمح لـmigration_user بـUPDATE على templates (بما فيها global).
  // templates_update الحاليّة تسمح فقط لصفوف tenant-scoped عبر GUC.
  // بلا هذه policy الجديدة · UPDATE على global يمرّ بلا affect (RLS silent).
  // نُبقيها بعد الهجرة — نمط مطابق لـmigration_user_all في exports/tenant_deletion_log/...
  pgm.sql(`
    CREATE POLICY templates_migration_user_all ON templates
      AS PERMISSIVE FOR ALL TO migration_user
      USING (true) WITH CHECK (true)
  `);

  const files = readdirSync(TEMPLATES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf-8'));
    const hash = canonicalHash(raw);
    const sourceRef = `@pf-mediakit/templates/${file}`;
    // WHERE يجعله idempotent فعليّاً — لا writes بلا داعٍ + لا trigger revision.
    pgm.sql(`
      UPDATE templates
      SET definition_hash = $$${hash}$$
      WHERE scope = 'global'
        AND source_ref = $$${sourceRef}$$
        AND definition_hash <> $$${hash}$$
    `);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // لا reverse للـhash — القيمة الصحيحة لا تُعاد. نُزيل policy فقط.
  pgm.sql(`DROP POLICY IF EXISTS templates_migration_user_all ON templates`);
}
