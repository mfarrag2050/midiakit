#!/usr/bin/env node
/**
 * check-response-envelope — يحرس §1.5 (النمط الموحَّد للترقيم).
 *
 * السياق (A11-SHAPE 2026-09-06): /v1/assets أعاد {items, nextCursor}
 * بدل {data, nextCursor, hasMore} المُلزَم في §1.5، فكسر عرض القائمة
 * في mk-studio. البوابات لم تلتقط الفرق لأنها تختبر الوجود لا الشكل.
 *
 * **الحدّ المُختار (يُعلَن):** تحليل نصّي على كل ملف route ينتهي
 * بـ`/list.ts`. لكل ملف:
 *   1. نستخرج جسم return object literal (السطر بعد `return {`).
 *   2. نُحصي المفاتيح top-level.
 *   3. **يجب** أن يحوي: `data`، `nextCursor`، `hasMore`.
 *   4. **يفشل صراحةً** إن حوى واحداً من: `items`، `results`، `rows`
 *      (المفاتيح البديلة الشائعة).
 *
 * الحدّ يتخطّى:
 *   - ملفات test (*.test.ts, *.spec.ts)
 *   - ملفات لا تحوي `cursor` أو `limit` (ليست list حقيقية)
 *
 * اختبار وجود (L-46):
 *   1. أنشئ apps/api/src/routes/_probe/list.ts فيه
 *      `return { items: [], nextCursor: null };`
 *   2. شغّل check-response-envelope ⇒ يخرج بـ1
 *   3. احذف الملف ⇒ يخرج بـ0
 *
 * الخروج: 0 نجاح · 1 فشل بالملف + المفتاح المكسور.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCAN_DIR = join(ROOT, 'apps/api/src/routes');

const REQUIRED = ['data', 'nextCursor', 'hasMore'];
const FORBIDDEN = ['items', 'results', 'rows'];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (entry === 'list.ts') files.push(p);
  }
  return files;
}

function extractReturnObjectKeys(src) {
  // نبحث عن `return {` ثم نتتبّع تعادل الأقواس.
  const keys = [];
  const re = /return\s*{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    // نستخرج مفاتيح top-level: key: أو key, (تسلسل كلمة قبل : أو , على بداية سطر)
    // بحذر: نتخطّى المحتوى داخل أقواس/أقواس معقوفة
    const topKeys = topLevelKeys(body);
    for (const k of topKeys) keys.push(k);
  }
  return keys;
}

function topLevelKeys(body) {
  const out = [];
  let depth = 0, inStr = null;
  let i = 0;
  const lines = body.split(/(?<=[,{}])/); // تقريب — نُقسّم لتيسير المسح
  // بدل ذلك: نمشي حرفاً حرفاً ونتتبّع البداية
  let bufStart = 0;
  for (i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      pushKey(body.slice(bufStart, i), out);
      bufStart = i + 1;
    }
  }
  pushKey(body.slice(bufStart), out);
  return out;
}

function pushKey(chunk, out) {
  // chunk قد يكون "key: value" أو "keyShorthand" أو "...spread"
  const trimmed = chunk.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!trimmed) return;
  if (trimmed.startsWith('...')) return; // spread — نتجاهله (قد يُدخل مفاتيح)
  const m = trimmed.match(/^(?:['"]?)([a-zA-Z_$][a-zA-Z0-9_$]*)(?:['"]?)\s*[:,]/);
  if (m) out.push(m[1]);
  else {
    // shorthand: `data,` → chunk = "data" فقط
    const s = trimmed.match(/^([a-zA-Z_$][a-zA-Z0-9_$]*)$/);
    if (s) out.push(s[1]);
  }
}

// ── main ───────────────────────────────────────────────
const files = walk(SCAN_DIR);
const errors = [];
let failCount = 0;
let checked = 0;

for (const file of files) {
  const rel = file.replace(ROOT + '/', '');
  const src = readFileSync(file, 'utf-8');

  // يتخطّى إن لم يوجد cursor/limit (ليس list حقيقياً)
  if (!/\bcursor\b|\blimit\b/.test(src)) continue;

  const returnKeys = extractReturnObjectKeys(src);
  if (returnKeys.length === 0) continue;

  // نجمع المفاتيح المميّزة عبر كل return blocks
  const set = new Set(returnKeys);

  const missing = REQUIRED.filter((k) => !set.has(k));
  const forbidden = FORBIDDEN.filter((k) => set.has(k));

  if (missing.length > 0 || forbidden.length > 0) {
    failCount++;
    errors.push(`  ✗ ${rel}`);
    if (missing.length > 0) errors.push(`      ينقص: [${missing.join(', ')}]`);
    if (forbidden.length > 0) errors.push(`      محظور: [${forbidden.join(', ')}] (استعمل 'data')`);
  }
  checked++;
}

if (failCount > 0) {
  console.error(`[check-response-envelope] ✗ ${failCount} انحراف عن §1.5 (النمط الموحَّد):`);
  for (const e of errors) console.error(e);
  console.error(`\n  المطلوب: return { data: [...], nextCursor, hasMore }`);
  process.exit(1);
}

console.log(`[check-response-envelope] ✓ ${checked} list endpoint(s) يحمل غلاف §1.5 (data/nextCursor/hasMore).`);
process.exit(0);
