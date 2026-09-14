#!/usr/bin/env node
// check-locale-parity — يفشل البناء إن اختلفت مجموعات المفاتيح
// بين قواميس apps/studio/src/i18n/{ar,mixed,en}.json.
//
// **السبب:** LocaleProvider يسقط على العربية عند غياب المفتاح.
// السقوط الصامت في وضع en يعني أن المستخدم الإنجليزي يرى نصّاً
// عربياً في مكان توقّع فيه إنجليزية — وهو غياب بنيوي (L-62 في
// طبقة الواجهة).
//
// **مستثنى:** المفاتيح التي تبدأ بـ`_` (توثيق داخل القاموس، مثل `_note`).
//
// **الاستخدام:** `node scripts/check-locale-parity.mjs`
// **الخروج:** 0 عند التطابق، 1 عند فارق.

import { readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// بعد S2-X (2026-09-05): القواميس في packages/i18n. override للاختبار.
const OVERRIDE = process.env.CHECK_SCOPE;
const I18N = OVERRIDE ? join(ROOT, OVERRIDE) : join(ROOT, 'packages', 'i18n', 'src');

const LOCALES = ['ar', 'mixed', 'en'];

function flatten(obj, prefix = '', out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue; // توثيق داخلي
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flatten(v, path, out);
    } else {
      out.add(path);
    }
  }
  return out;
}

// حراسة الإبطال — L-46 على مستوى وجود القواميس نفسها.
const sets = {};
for (const loc of LOCALES) {
  const p = join(I18N, `${loc}.json`);
  try {
    const raw = await readFile(p, 'utf8');
    sets[loc] = flatten(JSON.parse(raw));
  } catch {
    console.error(`[check-locale-parity] ✗ قاموس مفقود: ${p}`);
    console.error('  نطاق فارغ = فحص مبطَل صامتاً. تحقّق من مسار I18N في السكربت.');
    process.exit(1);
  }
}

const total = Math.max(...Object.values(sets).map((s) => s.size));
console.log(`[check-locale-parity] فحص ${LOCALES.length} قواميس في ${relative(ROOT, I18N)} — ${total} مفتاح أقصى …`);

const missing = {};
let anyMiss = false;
for (const a of LOCALES) {
  for (const b of LOCALES) {
    if (a === b) continue;
    const key = `${a}⇒${b}`;
    const diff = [...sets[a]].filter((k) => !sets[b].has(k));
    if (diff.length > 0) {
      missing[key] = diff;
      anyMiss = true;
    }
  }
}

if (!anyMiss) {
  console.log(`  ✓ نظيف — مجموعات المفاتيح متطابقة عبر ar · mixed · en.`);
  process.exit(0);
}

console.error(`  ✗ اختلاف في مجموعات المفاتيح:`);
for (const [pair, keys] of Object.entries(missing)) {
  console.error(`    [${pair}]  ${keys.length} مفتاح موجود في ${pair.slice(0, 2)} وغائب في ${pair.slice(-2)}:`);
  for (const k of keys.slice(0, 20)) console.error(`      · ${k}`);
  if (keys.length > 20) console.error(`      … +${keys.length - 20}`);
}
console.error('');
console.error('  الحل: أضف كل مفتاح إلى جميع القواميس (أو ابدأه بـ`_` إن كان توثيقاً داخلياً).');
process.exit(1);
