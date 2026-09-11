#!/usr/bin/env node
/**
 * BK-NUMERALS — check-brand-kit-patch-coverage (حارس بنيوي).
 *
 * قاعدة: كل حقل top-level في BrandKit type
 * (packages/shared/src/brand-kit.ts) يجب أن يكون مذكوراً إمّا في
 * ALLOWED_TOP_LEVEL أو في BLOCKED_PATHS من apps/api/src/routes/brand-kits/update.ts.
 * حقل جديد في النوع بلا support ⇒ فشل البناء بذكر الحقل.
 *
 * السبب: PATCH كان يبتلع مفاتيح مجهولة صامتاً (S13 من mk-studio: بدت
 * `bidi.numerals='arabic'` وكأنها تُطبَّق ثم تُختفي). الفحص يمنع تكرار
 * العيب مع كل حقل جديد.
 *
 * L-46 اختبار الوجود: أضف مؤقتاً `newField: string` إلى `interface BrandKit`
 * بلا لمس update.ts. شغّل السكربت — يجب أن يخرج بـ1 (يذكر `newField`).
 * احذف الإضافة — يخرج بـ0.
 *
 * الخروج: 0 نجاح · 1 فشل بذكر المفاتيح غير المُغطّاة.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TYPE_FILE = join(ROOT, 'packages/shared/src/brand-kit.ts');
const HANDLER_FILE = join(ROOT, 'apps/api/src/routes/brand-kits/update.ts');

// ── 1. استخراج مفاتيح BrandKit top-level من النوع ──
const typeSrc = readFileSync(TYPE_FILE, 'utf8');
// نجد `interface BrandKit {` ونقرأ إلى `\n}` مطابق
const start = typeSrc.indexOf('export interface BrandKit {');
if (start < 0) {
  console.error('✗ لم يُعثر على interface BrandKit في ' + TYPE_FILE);
  process.exit(2);
}
const blockStart = typeSrc.indexOf('{', start);
// نجد `\n}` (نهاية بلوك على مستوى الجذر — البلوك الوحيد)
let depth = 0, blockEnd = -1;
for (let i = blockStart; i < typeSrc.length; i++) {
  if (typeSrc[i] === '{') depth++;
  else if (typeSrc[i] === '}') { depth--; if (depth === 0) { blockEnd = i; break; } }
}
if (blockEnd < 0) { console.error('✗ لم يُغلق interface BrandKit'); process.exit(2); }
const body = typeSrc.slice(blockStart + 1, blockEnd);

// نستخرج مفاتيح top-level — أسطر `[readonly]? name[?]: ...`
// نتجاهل تعليقات JSDoc والأسطر الفارغة والتعليقات المفتوحة.
const typeKeys = new Set();
let inDocComment = false;
for (const rawLine of body.split('\n')) {
  const line = rawLine.trim();
  if (!line) continue;
  if (line.startsWith('/**') || line.startsWith('/*')) inDocComment = !line.endsWith('*/');
  else if (inDocComment) { if (line.endsWith('*/')) inDocComment = false; }
  else if (line.startsWith('//') || line.startsWith('*')) { /* comment */ }
  else {
    // `readonly name?: Type;` أو `readonly name: Type;`
    const m = line.match(/^(readonly\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/);
    if (m) typeKeys.add(m[2]);
  }
}

// ── 2. استخراج ALLOWED_TOP_LEVEL و BLOCKED_PATHS من المعالج ──
const handlerSrc = readFileSync(HANDLER_FILE, 'utf8');
function extractList(src, name) {
  const idx = src.indexOf(`${name}`);
  if (idx < 0) return new Set();
  // نبحث عن `= [` (قد يمرّ عبر `readonly string[]` قبله — نتخطّاه)
  const assignIdx = src.indexOf('= [', idx);
  if (assignIdx < 0) return new Set();
  const bracket = assignIdx + 2;
  // نجد `];` مطابقاً — يتخطّى `[` داخلية في strings
  let depth = 1, closeBracket = -1;
  for (let i = bracket + 1; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { closeBracket = i; break; } }
  }
  if (closeBracket < 0) return new Set();
  const body = src.slice(bracket + 1, closeBracket);
  const items = new Set();
  for (const m of body.matchAll(/'([^']+)'/g)) items.add(m[1]);
  return items;
}
const allowed = extractList(handlerSrc, 'ALLOWED_TOP_LEVEL:');
const blocked = extractList(handlerSrc, 'BLOCKED_PATHS');
// blocked يحمل dot-path — نأخذ segment أول (top-level)
const blockedTop = new Set([...blocked].map((p) => p.split('.')[0]));

// ── 3. المقارنة ──
const uncovered = [];
for (const k of typeKeys) {
  if (!allowed.has(k) && !blockedTop.has(k)) uncovered.push(k);
}

// ── 4. المقلوب: ALLOWED خارج النوع (ربما حقل قديم مُزال) ──
const orphaned = [];
for (const k of allowed) {
  if (!typeKeys.has(k)) orphaned.push(k);
}

if (uncovered.length > 0 || orphaned.length > 0) {
  console.error('✗ check-brand-kit-patch-coverage:');
  if (uncovered.length > 0) {
    console.error(`  ${uncovered.length} مفتاح في BrandKit بلا support في PATCH:`);
    for (const k of uncovered) console.error(`    - ${k}  (أضِفه إلى ALLOWED_TOP_LEVEL أو BLOCKED_PATHS)`);
  }
  if (orphaned.length > 0) {
    console.error(`  ${orphaned.length} مفتاح في ALLOWED بلا مقابل في BrandKit type:`);
    for (const k of orphaned) console.error(`    - ${k}  (احذفه من ALLOWED_TOP_LEVEL أو أضِفه إلى النوع)`);
  }
  process.exit(1);
}
console.log(`✓ check-brand-kit-patch-coverage: ${typeKeys.size} مفتاحاً في النوع، ${allowed.size} في ALLOWED، ${blockedTop.size} في BLOCKED_TOP — تغطية كاملة`);
process.exit(0);
