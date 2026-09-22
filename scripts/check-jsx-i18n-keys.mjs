#!/usr/bin/env node
// check-jsx-i18n-keys — يحرس أن كلّ مفتاحٍ حرفيّ يمرّ إلى `titleKey` /
// `bodyKey` / `subtitleKey` / `labelKey` / `headerKey` / `emptyKey` /
// `confirmKey` / `messageKey` أو إلى setter اسمُه `set*ErrorKey('...')`
// موجودٌ فعلاً في `packages/i18n/src/ar.json`.
//
// **٤٢٠ §٤:** الأداةُ الحاليّة `check:ui-keys` تحرس ألاّ يوجد نصٌّ مقروء
// داخل مكوّنات `packages/ui` و`apps/studio/src/ui`. لا تلمس مفاتيح i18n،
// ولا تفحص `apps/studio/app/**` (الشاشات). هذا الحارس يكمّلها:
//   • النطاق: `apps/studio/app/**/*.tsx` (الشاشات فقط)
//   • ما يفحصه: `<Component titleKey="literal">` + `setXxxErrorKey('literal')`
//   • ما يفشله: مفتاح غير موجود في `ar.json` (الشجرةُ الجذرُ في fallback
//     LocaleProvider — إن غاب هناك، يعود المفتاحُ سطراً على شاشة المستخدم).
//
// **لا يفحص:** المتغيّرات الديناميكيّة (`titleKey={someVar}`) — هذه تعتمد
// على قراءة runtime وتغطّيها `check:locale-parity` بحسب استعمالها.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCOPE = join(ROOT, 'apps', 'studio', 'app');
const DICT_PATH = join(ROOT, 'packages', 'i18n', 'src', 'ar.json');

const SELF_TEST = process.env.SELF_TEST === '1';

/** مفاتيحُ Props التي تحمل i18n literal. */
const KEY_PROPS = new Set([
  'titleKey',
  'bodyKey',
  'subtitleKey',
  'labelKey',
  'headerKey',
  'emptyKey',
  'confirmKey',
  'messageKey',
  'placeholderKey',
]);

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    if (e.name === 'node_modules') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, pre) => pre);
}

function lookup(dict, key) {
  const parts = key.split('.');
  let node = dict;
  for (const p of parts) {
    if (typeof node !== 'object' || node === null) return null;
    node = node[p];
  }
  return typeof node === 'string' ? node : null;
}

function scanFile(src) {
  const clean = stripComments(src);
  const bad = [];
  // (١) props: `titleKey="literal"` أو `titleKey={'literal'}`.
  const propRe = /(\w+Key)\s*=\s*(?:"([^"]+)"|\{\s*['"]([^'"]+)['"]\s*\})/g;
  let m;
  while ((m = propRe.exec(clean))) {
    const propName = m[1];
    const literal = m[2] ?? m[3];
    if (!KEY_PROPS.has(propName)) continue;
    if (!literal || literal.length === 0) continue;
    // مفاتيح نقاطيّة فقط — تجاهل ما يبدو غير مفتاح (بلا نقطة، بلا حرف صغير).
    if (!/^[a-zA-Z][\w.]*$/.test(literal)) continue;
    bad.push({ line: lineOf(src, m.index), prop: propName, key: literal });
  }
  // (٢) setter ErrorKey / MessageKey: `setFooErrorKey('literal')` كسقوطٍ افتراضيّ.
  const setRe = /set\w*(?:Error|Message|Notice)Key\s*\(\s*['"]([^'"]+)['"]/g;
  while ((m = setRe.exec(clean))) {
    const literal = m[1];
    if (!/^[a-zA-Z][\w.]*$/.test(literal)) continue;
    bad.push({ line: lineOf(src, m.index), prop: 'setter', key: literal });
  }
  // (٣) `.messageKey` fallbacks: `err.messageKey : 'literal'`.
  const fbRe = /messageKey\s*:\s*['"]([^'"]+)['"]/g;
  while ((m = fbRe.exec(clean))) {
    const literal = m[1];
    if (!/^[a-zA-Z][\w.]*$/.test(literal)) continue;
    bad.push({ line: lineOf(src, m.index), prop: 'fallback', key: literal });
  }
  return bad;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}

async function main() {
  const dictRaw = await readFile(DICT_PATH, 'utf8');
  const dict = JSON.parse(dictRaw);
  const files = await walk(SCOPE);
  const failures = [];

  for (const f of files) {
    const src = await readFile(f, 'utf8');
    const hits = scanFile(src);
    for (const h of hits) {
      const val = lookup(dict, h.key);
      if (val === null) {
        failures.push({
          file: relative(ROOT, f),
          line: h.line,
          prop: h.prop,
          key: h.key,
        });
      }
    }
  }

  if (SELF_TEST) {
    // الاختبارُ الذاتيّ (L-46): يزرع مفتاحاً غير موجود في نصٍّ اختباريّ
    // ثمّ يتحقّق أنّ الحارسَ يرصده. لا يمسّ الشجرة الحقيقيّة.
    const fake = `<Alert titleKey="errors.NOT_A_REAL_KEY_XYZ" />`;
    const hits = scanFile(fake);
    const val = lookup(dict, hits[0]?.key ?? '');
    if (hits.length !== 1 || val !== null) {
      console.error('  ✗ self-test: الحارس لم يرصد المفتاح المزروع.');
      process.exit(2);
    }
    console.log('  ✓ self-test: الحارس رصد المفتاح المزروع.');
  }

  if (failures.length > 0) {
    console.error(
      `check:jsx-i18n-keys ✗ — ${failures.length} مفتاحاً غيرَ موجود:`
    );
    for (const f of failures.slice(0, 60)) {
      console.error(`  ${f.file}:${f.line} · ${f.prop} · ${f.key}`);
    }
    if (failures.length > 60) {
      console.error(`  … و ${failures.length - 60} أُخرى.`);
    }
    console.error(
      '\n  الحلّ: أضف المفتاح إلى `packages/i18n/src/ar.json`، أو صحّح الحرفيّة.'
    );
    process.exit(1);
  }

  console.log(`check:jsx-i18n-keys ✓ — ${files.length} ملفّاً، لا خرق.`);
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(2);
});
