/**
 * 601h · مزامنة قالب `reel` بعد إضافة `videoBlock` في 601b.
 *
 * أضاف 178c609 كتلة الفيديو إلى المصدر بلا مزامنة manifest ولا هجرة.
 * هذه الهجرة تحمل أثر DB المفقود؛ لا تغيّر القالب ولا تلغي عمل 601b.
 * يُقرأ التعريف من reel.json، ويُحدَّث القالب العالمي وحده بشرط SOURCE_REF،
 * بنفس بنية هجرة 440 ودالّة canonicalHash لضمان تطابق المصدر والبصمة.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const __dirname = dirname(fileURLToPath(import.meta.url));
const REEL_JSON_PATH = join(__dirname, '../../templates/src/templates/reel.json');
const SOURCE_REF = '@pf-mediakit/templates/reel.json';

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
  const raw = JSON.parse(readFileSync(REEL_JSON_PATH, 'utf-8')) as {
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
