#!/usr/bin/env node
// scripts/check-user-facing-devlang.mjs — 390 §٣.
//
// **القاعدة:** لا اسمَ قالبٍ ولا نصَّ i18n يراه المستخدم يحمل لغةَ
// التطوير الداخليّة («المرحلة 2» · «إثبات بوّابة» · `mock` · `dev`
// · `seed` · `phase` · `test` · `demo` · `TODO` · `FIXME`).
//
// **الأرض:**
//   1. `packages/templates/src/templates/*.json` — حقل `name` في كلّ ملفّ.
//   2. `packages/i18n/src/{ar,mixed,en}.json` — كلّ قيمة نصّيّة (walk
//      recursive)، مع استثناء المفاتيح تحت `errors.*` (رموز مطوّرين لا
//      نصوص UI · L-22)، ومفاتيح `dev` تحت أيّ عقدة صراحةً.
//
// **قائمة الكلمات المُحمَّرة:**
//   - عربيّاً: /إثبات\s*(?:بوّابة|بوابة)/ · /المرحلة\s*[٠-٩0-9]/
//   - لاتينيّاً (word boundary): mock · dev · seed · phase · demo · TODO · FIXME
//   - `test` مستثنى في اللاتينيّ لأنّه يظهر مشروعاً في `testEmail`
//     ونحوه في UI حقيقيّة (اختبار البريد قبل الحفظ) — بديله الشرعيّ
//     في القاموس بجملة كاملة إن دخل نطاقاً مشبوهاً.
//
// **L-46:** شُغِّل يدوياً — احقن `"phase 2"` في قيمة i18n، شغّل
// السكربت ⇒ يجب أن يفشل ذاكراً الملفّ والمسار داخل JSON.
//   ثم استرجع ⇒ نظيف. المخرَج مسجَّل في تقرير 390.
//
// **الاستخدام:** `node scripts/check-user-facing-devlang.mjs`

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const TEMPLATE_DIR = join(ROOT, 'packages/templates/src/templates');
const I18N_DIR = join(ROOT, 'packages/i18n/src');

const AR_PATTERNS = [
  { re: /إثبات\s*(?:بوّابة|بوابة)/, label: 'إثبات بوابة' },
  { re: /المرحلة\s*[٠-٩0-9]/, label: 'المرحلة N' },
];

const LATIN_WORDS = ['mock', 'dev', 'seed', 'phase', 'demo', 'TODO', 'FIXME'];
const LATIN_PATTERNS = LATIN_WORDS.map((w) => ({
  re: new RegExp(`\\b${w}\\b`, w === w.toLowerCase() ? 'i' : ''),
  label: w,
}));

const ALL_PATTERNS = [...AR_PATTERNS, ...LATIN_PATTERNS];

/** اكتشف أوّل مطابقة في نصّ. */
function match(text) {
  for (const p of ALL_PATTERNS) {
    const m = p.re.exec(text);
    if (m) return { label: p.label, snippet: m[0] };
  }
  return null;
}

const errors = [];

// (1) templates: حقل name فقط — لا layers ولا fields (تلك تُقاس بمعزل).
const templateFiles = (await readdir(TEMPLATE_DIR)).filter((f) => f.endsWith('.json'));
for (const f of templateFiles) {
  const path = join(TEMPLATE_DIR, f);
  const doc = JSON.parse(await readFile(path, 'utf8'));
  if (typeof doc.name === 'string') {
    const hit = match(doc.name);
    if (hit) {
      errors.push(
        `  ✗ ${f}: "name" يحوي «${hit.snippet}» (${hit.label}) — لا لغة تطوير في اسم قالب.`,
      );
    }
  }
}

// (2) i18n: walk recursive، استثنِ `errors.*` كاملاً.
function walk(node, path, out) {
  if (typeof node === 'string') {
    // استثنِ قيم errors.* (رموز مطوّرين بحسب L-22).
    if (path[0] === 'errors') return;
    const hit = match(node);
    if (hit) {
      out.push({ path: path.join('.'), snippet: hit.snippet, label: hit.label, value: node });
    }
    return;
  }
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    for (const [k, v] of Object.entries(node)) walk(v, [...path, k], out);
  }
}

const i18nFiles = ['ar.json', 'mixed.json', 'en.json'];
for (const f of i18nFiles) {
  const path = join(I18N_DIR, f);
  const doc = JSON.parse(await readFile(path, 'utf8'));
  const hits = [];
  walk(doc, [], hits);
  for (const h of hits) {
    errors.push(
      `  ✗ ${f}: ${h.path} يحوي «${h.snippet}» (${h.label}) — لا لغة تطوير في نصّ يراه المستخدم.`,
    );
  }
}

if (errors.length > 0) {
  console.error(`[check-user-facing-devlang] ✗ ${errors.length} تسريب لغة تطوير:`);
  for (const e of errors) console.error(e);
  console.error('\n  الحلّ: أعد صياغة النصّ بمنطق منتَجيٍّ لا يذكر رقم المرحلة أو مصطلح المطوّر.');
  process.exit(1);
}

console.log(
  `[check-user-facing-devlang] ✓ ${templateFiles.length} قالب + ${i18nFiles.length} قاموس · نظيف.`,
);
process.exit(0);
