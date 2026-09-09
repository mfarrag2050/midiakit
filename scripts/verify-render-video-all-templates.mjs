#!/usr/bin/env node
// scripts/verify-render-video-all-templates — يشغّل renderVideo على كل
// قالب من الستة ويؤكّد لكلٍّ:
//   (أ) renderVideo ينجح دون رمي.
//   (ب) زمن التنفيذ ≤ 5 ثوان (بديل time-based عن عدّاد in-loop —
//       عدّاد داخل packages/engine يخرق engine-purity، والزمن دليل
//       غير مباشر لكنّه حادّ: prepareHeadline in-loop = ~150ms × 225
//       إطار = ~34s. ≤ 5s يستحيل بلا استهلاك الخطة).
//   (ج) طباعة: اسم القالب · زمن · نجاح/فشل.
//
// **السبب البنيوي (WIRE-1 · 2026-09-09):** verify:plan-all-templates
// بقي خارج test أمس فلم يمنع انحدار KICKER-2. هذا الفاحص **داخل test**
// — أيّ انحدار في مسار الاستهلاك (لا فقط البناء) يفشله فوراً.
//
// **الحدّ 5 ثوان قابل للمراجعة:** BEFORE = 8-49s (كل قالب) · AFTER =
// 1.2-1.5s. 5s نصف الفجوة — يترك هامشاً لتفاوت التشغيل، ويقطع بحسم
// عند أيّ انحدار.

import { performance } from 'node:perf_hooks';
import { renderVideo } from '@pf-mediakit/renderer';
import { TEMPLATES } from '@pf-mediakit/templates';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TIME_THRESHOLD_MS = 5000;

// محتوى قياسي يحمل مفاتيح كل الحقول الممكنة في القوالب الستّة.
const CONTENT = {
  kicker: 'كيكر تجريبي',
  headline: 'عنوان تجريبي متوسّط الطول لاختبار الاستهلاك',
  title: 'عنوان ريلز تجريبي',
  source: 'مصدر',
  caption: 'ترجمة',
  location: 'موقع',
  sourceHandle: '@test',
  sourceName: 'مصدر اختبار',
};

const OUT_DIR = mkdtempSync(join(tmpdir(), 'verify-render-video-'));

console.log('▶ verify-render-video-all-templates');
console.log(`  ${Object.keys(TEMPLATES).length} قالب · الحدّ الأقصى ${TIME_THRESHOLD_MS}ms · مخرَج في ${OUT_DIR}`);
console.log();

const results = [];
for (const [name, template] of Object.entries(TEMPLATES)) {
  const outPath = join(OUT_DIR, `${name}.mp4`);
  const t0 = performance.now();
  try {
    await renderVideo({
      template,
      brand: DEFAULT_BRAND,
      content: CONTENT,
      size: { w: 1080, h: 1080 },
      outPath,
      fps: 30,
    });
    const ms = performance.now() - t0;
    const status = ms <= TIME_THRESHOLD_MS ? 'OK' : 'SLOW';
    const mark = status === 'OK' ? '✓' : '✗';
    console.log(`  ${mark} ${name}: ${ms.toFixed(0)}ms · ${status}`);
    results.push({ name, status, ms });
  } catch (err) {
    const ms = performance.now() - t0;
    console.log(`  ✗ ${name}: ${ms.toFixed(0)}ms · فشل: ${err.message.slice(0, 100)}`);
    results.push({ name, status: 'FAIL', ms, error: err.message });
  }
}

console.log();

// تنظيف
try { rmSync(OUT_DIR, { recursive: true }); } catch { /* noop */ }

const failed = results.filter((r) => r.status === 'FAIL');
const slow = results.filter((r) => r.status === 'SLOW');

if (failed.length > 0 || slow.length > 0) {
  console.error(
    `✗ verify-render-video-all-templates FAILED — ` +
    `${failed.length} فشل · ${slow.length} أبطأ من ${TIME_THRESHOLD_MS}ms`
  );
  for (const f of failed) console.error(`  فشل: ${f.name} · ${f.error?.slice(0, 100)}`);
  for (const s of slow) console.error(`  بطء: ${s.name} = ${s.ms.toFixed(0)}ms (أعلى من ${TIME_THRESHOLD_MS}ms — انحدار مسار الاستهلاك؟)`);
  process.exit(1);
}

console.log(
  `✓ verify-render-video-all-templates PASSED — ${results.length} قوالب ` +
  `كلّها نجحت في ≤ ${TIME_THRESHOLD_MS}ms`
);
process.exit(0);
