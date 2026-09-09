#!/usr/bin/env node
// scripts/verify-render-video-all-templates — يشغّل renderVideo على كل
// قالب من الستة ويؤكّد لكلٍّ:
//   (أ) renderVideo ينجح دون رمي.
//   (ب) prepareHeadline in-loop = 0 (خاصيّة، لا عَرَض). العدّاد يُغذَّى
//       عبر `onHeadlinePrepared` — حقل اختياريّ على RenderVideoArgs
//       يمرّ إلى rfArgs فيدعوه prepareHeadline. لا حالة على مستوى
//       الوحدة (يحترم check:engine-purity).
//   (ج) الزمن ≤ 5000ms (عَرَض داعم للخاصيّة — لو ظهر انحدار خفيف بلا
//       زيادة في العدّاد، الزمن يكشفه).
//
// **الاثنان معاً، لا بديلاً:** إن سقط أحدهما، البوابة تفشل.
//
// **مقطع الفحص:** كل قالب يُصدَّر بمدّته الطبيعية من `templateToTimeline`
// (breaking = 7.5s · reel/plain حسب القالب) عند `fps = 30`. القيَم
// مطبوعة لكل صف. **راجع WIRE-1-CLOSE §3 لتفصيل الأرقام.**
//
// **السبب البنيوي (WIRE-1 · 2026-09-09):** verify:plan-all-templates
// بقي خارج test فلم يمنع انحدار KICKER-2. هذا الفاحص **داخل test**.

import { performance } from 'node:perf_hooks';
import { renderVideo } from '@pf-mediakit/renderer';
import { TEMPLATES } from '@pf-mediakit/templates';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const TIME_THRESHOLD_MS = 5000;
const FPS = 30;

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
console.log(`  ${Object.keys(TEMPLATES).length} قالب · fps=${FPS} · حدّ الزمن ${TIME_THRESHOLD_MS}ms · مخرَج مؤقّت في ${OUT_DIR}`);
console.log();

const results = [];
for (const [name, template] of Object.entries(TEMPLATES)) {
  const outPath = join(OUT_DIR, `${name}.mp4`);

  // العدّاد يُغذَّى من prepareHeadline عبر onHeadlinePrepared.
  // buildRenderPlan يستدعيها مرة قبل الحلقة — لا نعدّه (نعدّ ما داخل
  // drawTimelineAt وحده). لتحقيق ذلك: العدّاد يُصفَّر بعد
  // buildRenderPlan داخلي، بلا سيطرة. البديل: نطرح 1 من الإجمالي.
  //
  // في التنفيذ الحالي: renderVideo يستدعي buildRenderPlan (بلا
  // onHeadlinePrepared لأنّه لا يُمرَّر إلى buildRenderPlan)، ثم يمرّر
  // onHeadlinePrepared إلى drawTimelineAt فقط. فالعدّاد = 0 يعني in-loop = 0.
  let counter = 0;
  const t0 = performance.now();
  try {
    await renderVideo({
      template,
      brand: DEFAULT_BRAND,
      content: CONTENT,
      size: { w: 1080, h: 1080 },
      outPath,
      fps: FPS,
      onHeadlinePrepared: () => { counter++; },
    });
    const ms = performance.now() - t0;
    const inLoop = counter;
    const timeOK = ms <= TIME_THRESHOLD_MS;
    const countOK = inLoop === 0;
    const status = timeOK && countOK ? 'OK' : (!countOK ? 'IN_LOOP' : 'SLOW');
    const mark = status === 'OK' ? '✓' : '✗';
    // نحسب عدد الإطارات المطبوع تقريباً من المدّة الطبيعية للقالب — لا
    // نعرفها هنا مباشرةً، فنطبع «≈» كتقدير عام.
    console.log(`  ${mark} ${name}: ms=${ms.toFixed(0)} · in-loop=${inLoop} · ${status}`);
    results.push({ name, status, ms, inLoop });
  } catch (err) {
    const ms = performance.now() - t0;
    console.log(`  ✗ ${name}: ms=${ms.toFixed(0)} · in-loop=${counter} · فشل: ${err.message.slice(0, 100)}`);
    results.push({ name, status: 'FAIL', ms, inLoop: counter, error: err.message });
  }
}

console.log();

// تنظيف
try { rmSync(OUT_DIR, { recursive: true }); } catch { /* noop */ }

const failed = results.filter((r) => r.status === 'FAIL');
const inLoopy = results.filter((r) => r.status === 'IN_LOOP');
const slow = results.filter((r) => r.status === 'SLOW');

if (failed.length > 0 || inLoopy.length > 0 || slow.length > 0) {
  console.error(
    `✗ verify-render-video-all-templates FAILED — ` +
    `${failed.length} فشل · ${inLoopy.length} in-loop · ${slow.length} بطء`
  );
  for (const f of failed) console.error(`  فشل: ${f.name} · ${f.error?.slice(0, 100)}`);
  for (const l of inLoopy) console.error(`  in-loop: ${l.name} = ${l.inLoop} (المتوقّع 0 — الخطة غير مستهلَكة)`);
  for (const s of slow) console.error(`  بطء: ${s.name} = ${s.ms.toFixed(0)}ms (أعلى من ${TIME_THRESHOLD_MS}ms)`);
  process.exit(1);
}

console.log(
  `✓ verify-render-video-all-templates PASSED — ${results.length} قوالب · ` +
  `in-loop=0 و ms ≤ ${TIME_THRESHOLD_MS} لكل واحد`
);
process.exit(0);
