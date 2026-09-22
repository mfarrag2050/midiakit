#!/usr/bin/env node
// scripts/regen-visual-refs.mjs — يجدّد `snapshots/` و `snapshots-semantic/`
// من مخرج `preview.mjs` مباشرةً · لا يَنسخ بين المرجعَين.
//
// **الخلفيّة (411ب · 2026-09-15):** `snapshots-semantic/` وُلد نسخةً
// بايت-بايت من `snapshots/` في 4ca3242، وبقي كذلك عبر كلّ تجديد يدويّ
// (آخره b4ce12e). النتيجة: 12/12 md5 متطابق · حارسٌ لا يحرس. الجذر:
// الآلة التي «تجدّد» كانت `cp` يدويّاً، لا مسار `--semantic=on`.
//
// **الآلة الجديدة (هذا السكربت):**
//   1. يفترض أنّ `preview.mjs` رُكض 4 مرّات (2 هويّتَين × 2 وضعَي دلالي)
//      قبل استدعائه · مخرَجه في `out/nosemantic/` و `out/semantic/`.
//   2. يَنسخ **الكشيدة فقط** إلى `snapshots/` و `snapshots-semantic/`
//      (verify-snapshot يقارن `-nokashida` غير المحروسة).
//   3. **لا يَنسخ بين snapshots ↔ snapshots-semantic أبداً** — الطريق
//      الوحيد إلى كلٍّ هو `out/nosemantic/` و `out/semantic/` على التوالي.
//   4. يفحص أخيراً أنّ 12/12 ليست متطابقة — إن كانت، يُفشل الرقم بصوت
//      عالٍ (فخّ النسخ عاد).
//
// **الاستعمال:** يُشغَّل داخل حاوية Linux (`bin/mk-ci --regen-refs`).
// المرجع لينكس (PLATFORM-2 · 2026-09-11) — تشغيله على macOS يُنتج
// مرجعاً مكسوراً على CI.
//
// **يُدعى بعد ركض `preview.mjs`:** الفصل يُفصل بين «توليد الرندر» و
// «تعيين المرجع» ليمكن مراجعة `out/*.png` بالعين قبل قبول المرجع.

import { copyFile, readFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const md5 = (b) => createHash('md5').update(b).digest('hex').slice(0, 12);

const PAIRS = [
  { srcDir: join(ROOT, 'out/nosemantic'), refDir: join(ROOT, 'snapshots'),          label: 'nosemantic' },
  { srcDir: join(ROOT, 'out/semantic'),   refDir: join(ROOT, 'snapshots-semantic'), label: 'semantic'   },
];

console.log('[regen-visual-refs] بدء · مصدرا التوليد: out/nosemantic/ و out/semantic/');

let totalChanged = 0;
for (const { srcDir, refDir, label } of PAIRS) {
  if (!existsSync(srcDir)) {
    console.error(`✗ ${srcDir.replace(ROOT + '/', '')} غير موجود — يجب ركض preview.mjs أوّلاً.`);
    process.exit(1);
  }
  if (!existsSync(refDir)) await mkdir(refDir, { recursive: true });

  const files = (await readdir(srcDir))
    .filter((f) => f.endsWith('.png') && !f.endsWith('-nokashida.png'))
    .sort();

  let changed = 0;
  let unchanged = 0;
  console.log(`\n[regen-visual-refs · ${label}] ${srcDir.replace(ROOT + '/', '')}/ → ${refDir.replace(ROOT + '/', '')}/`);
  for (const f of files) {
    const src = join(srcDir, f);
    const dst = join(refDir, f);
    const newBytes = await readFile(src);
    const newMd5 = md5(newBytes);
    let priorMd5 = 'NEW-FILE';
    let priorSize = 0;
    if (existsSync(dst)) {
      const priorBytes = await readFile(dst);
      priorMd5 = md5(priorBytes);
      priorSize = priorBytes.length;
    }
    if (priorMd5 !== newMd5) {
      await copyFile(src, dst);
      changed++;
      const delta = newBytes.length - priorSize;
      const sign = delta >= 0 ? '+' : '';
      console.log(`  ~ ${f.padEnd(44)} ${priorMd5} → ${newMd5}  Δ=${sign}${delta}b`);
    } else {
      unchanged++;
    }
  }
  console.log(`  ${label.padEnd(11)} — ${changed} تُغيّر · ${unchanged} كما هو · ${files.length} إجماليّاً`);
  totalChanged += changed;
}

// ─── حارسٌ نهائيّ · فخّ النسخ ────────────────────────────
console.log('\n[regen-visual-refs] فحصُ فخّ النسخ (snapshots/ ↔ snapshots-semantic/)…');
const A = join(ROOT, 'snapshots');
const B = join(ROOT, 'snapshots-semantic');
const aFiles = (await readdir(A))
  .filter((f) => f.endsWith('.png') && !f.endsWith('-nokashida.png'))
  .sort();
let sameCount = 0;
let differCount = 0;
for (const f of aFiles) {
  const bp = join(B, f);
  if (!existsSync(bp)) continue;
  const [ba, bb] = await Promise.all([readFile(join(A, f)), readFile(bp)]);
  if (md5(ba) === md5(bb)) sameCount++;
  else differCount++;
}
console.log(`  بصمة: ${sameCount}/${aFiles.length} متطابقة (محتوى لا يُشغِّل الكسر الدلاليّ) · ${differCount} مختلفة (الكسر فَعَل)`);

if (aFiles.length > 0 && differCount === 0) {
  console.error('');
  console.error(`✗ فخّ النسخ · ${sameCount}/${aFiles.length} في snapshots-semantic/ متطابقة بايت-بايت مع snapshots/.`);
  console.error(`  ⇒ --semantic=on لم يُنتج فرقاً في أيّ ملفّ. السبب المحتمل:`);
  console.error(`    · brand.typography.semanticBreaks.enabled لا يُقلَب فعلاً بـ--semantic=on؟`);
  console.error(`    · data/external/*.json مفقود أو فارغ؟`);
  console.error(`    · fixture headline لا يُشغِّل الكسر الدلاليّ (اختبر بـHEADLINE_LONG)؟`);
  process.exit(1);
}

console.log(`\n[regen-visual-refs] تمّ · ${totalChanged} ملفّاً تُغيّر إجماليّاً.`);
