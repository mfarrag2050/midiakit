/**
 * A28 — إعادة حساب `plans.definition_hash` بنطاق الهوية فقط.
 *
 * check-plan-sync تحوَّل نطاقه (2026-09-07) — يحرس الهوية (key · name_ar
 * · name_en) فقط، لا الحدود والسعر. الصفوف المبذورة في
 * `20260907030000_plans-a26.ts` تحمل hash بنطاق قديم (كل الحقول).
 * نُعيد الحساب حتى يمرّ الحارس بعد التحوّل.
 *
 * canonical hash = SHA256(JSON.stringify(sortKeysDeep({key, name_ar, name_en})))
 */
import { createHash } from 'node:crypto';
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

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
  const rows = await pgm.db.query(`SELECT key, name_ar, name_en FROM plans`);
  const list = (rows as { rows: Array<{ key: string; name_ar: string; name_en: string }> }).rows;
  for (const row of list) {
    const h = canonicalHash({ key: row.key, name_ar: row.name_ar, name_en: row.name_en });
    pgm.sql(`UPDATE plans SET definition_hash = '${h}' WHERE key = '${row.key.replace(/'/g, "''")}'`);
  }
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // No-op — down لا يُعيد الـhash القديم (سيُحسب لاحقاً من الهجرات
  // الأصلية إن اقتضى الأمر db:reset).
}
