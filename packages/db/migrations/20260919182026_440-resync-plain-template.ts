/**
 * 440 · إعادةُ مزامنة قالب `plain` مع المصدر — الاسم يبلغ الشاشة.
 *
 * ── لماذا ───────────────────────────────────────────────────
 * تحرّي 950 حكم: إصلاحُ اسمِ `plain.json` في المصدر (390 §١)
 * «بطاقة بسيطة» ← «بسيط — إثبات بوابة المرحلة 2» لا يبلغُ DB لأنّ
 * هجرةَ البذرِ الأصليّة `20260906120000_templates-a13.ts` تكتب بـ
 * `ON CONFLICT DO NOTHING`، ولا `UPDATE templates SET name` في أيّ
 * هجرةٍ لاحقة. الفشلُ صاخبٌ (`check:template-sync` يسقط)، لكنّ
 * الإصلاحَ لا يقع تلقائياً — هذه الهجرةُ هي الحلقة المفقودة.
 *
 * ── التصميم ────────────────────────────────────────────────
 * `UPDATE` جراحيّ:
 *   1. **بشرطٍ صريح يُسمّي القالب** — `WHERE scope = 'global' AND
 *      source_ref = '@pf-mediakit/templates/plain.json'`. لا مساسَ
 *      بغيره من الصفوف.
 *   2. **مصدرُ الحقيقة واحد** — القيمة الجديدة (`raw`) تُقرأ من
 *      `packages/templates/src/templates/plain.json` نفسه، تماماً
 *      كما فعلت هجرةُ البذرِ الأصليّة. لا نصٌّ يُكتب هنا يدوياً.
 *   3. **الاسم والبصمة معاً** — `name`, `kind`, `definition`،
 *      و`definition_hash` يُحدَّثون في نفس البيان كي يبقى الحارس
 *      `check:template-sync` أخضر بعد التطبيق.
 *
 * ── لماذا `plain.json` وحده ───────────────────────────────
 * القوالب الخمسة الأخرى (`breaking`, `card-*`, `reel`) أسماؤها
 * منتَجيّة أصلاً — لا انحراف بين المصدر و DB (فحصتُه: راجع تقرير
 * 440 §٢). توسيعُ هذا النمط لهم عند الحاجة بهجرةٍ نظيرة، لا هنا.
 *
 * ── L-59 ────────────────────────────────────────────────────
 * لا مسّ لسياسات RLS · لا تعديل schema · تحديثُ صفٍّ واحدٍ عالميٍّ.
 * على قاعدةٍ لم تُبذَر بعد (fresh) الهجرة تمرّ بلا أثر (WHERE يعود
 * 0 صفوف) — الهجرةُ الأصليّة `templates-a13` ستكتب القيمة الجديدة
 * مباشرة من `plain.json` (المصدرُ الواحد لكلا المسارَين).
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLAIN_JSON_PATH = join(__dirname, '../../templates/src/templates/plain.json');
const SOURCE_REF = '@pf-mediakit/templates/plain.json';

// نفسُ الدوال بحرفها في `templates-a13.ts:72-84` — canonical hash يجب
// أن يطابق. أنسخ لا أستورد (الهجرات مستقلّة عن بعضها بالتصميم).
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
  const raw = JSON.parse(readFileSync(PLAIN_JSON_PATH, 'utf-8')) as {
    name: string;
    kind: string;
  };
  const hash = canonicalHash(raw);

  pgm.sql(`
    UPDATE templates
       SET name             = $$${raw.name.replace(/\$/g, '\\$')}$$,
           kind             = $$${raw.kind.replace(/\$/g, '\\$')}$$,
           definition       = $$${JSON.stringify(raw).replace(/\$/g, '\\$')}$$::jsonb,
           definition_hash  = $$${hash}$$,
           updated_at       = now()
     WHERE scope = 'global'
       AND source_ref = $$${SOURCE_REF}$$
  `);
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // إعادةُ الاسم القديم عمداً بلا معنى — سيبقى الحارس أحمر بلا فائدة.
  // على أيّ قاعدةٍ تراجعت عن هذه الهجرة، الهجرة اللاحقة (لو أُعيدت up)
  // ستكتب القيمة الجديدة مرّة أخرى من المصدر. لا-op مُتَعمَّد.
}
