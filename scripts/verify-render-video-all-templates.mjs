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
import { buildRenderPlan, templateToTimeline, resolveBrand } from '@pf-mediakit/engine';
import { Canvas } from 'skia-canvas';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mk/528 · السقفُ الحقيقيّ للأداء — يُنفَّذ على mk-ci المحلّيّ (المرجعُ
// الفعليّ للمطوّر) وعلى Nightly (perf) حيث runner مخصَّصٌ لا تتذبذب سعتُه.
// GitHub Actions ubuntu-latest المشترك يتذبذب: mk-api-525 قاس breaking
// وcard_bottom يتضاعفان معاً (~7.9s) بينما main التالي مباشرةً بلا SLOW —
// خنقُ CPU على الـrunner لا انحدار كود. لذا نطبّق تسامحاً على CI فقط
// (CI=true وليس Nightly) بعامل 1.8 (فوقَ الذروة المرصودة 7.9s بهامش)،
// مع تحذيرٍ لا فشلٍ في المدى المتسامَح، وفشلٍ فوق 9000ms.
const RENDER_CAP_MS = 5000;
const CI_TOLERANCE = 1.8; // → 9000ms — أعلى من الذروة المرصودة (7939ms) بهامشٍ لطيف.
const IS_CI = process.env.CI === 'true' || process.env.CI === '1';
const IS_NIGHTLY = process.env.MK_NIGHTLY === '1' || process.env.NIGHTLY === '1';
const TOLERATE_CI_SLOW = IS_CI && !IS_NIGHTLY;
const CI_HARD_CAP_MS = TOLERATE_CI_SLOW ? Math.round(RENDER_CAP_MS * CI_TOLERANCE) : RENDER_CAP_MS;
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
const capNote = TOLERATE_CI_SLOW ? `${RENDER_CAP_MS}ms صارم / ${CI_HARD_CAP_MS}ms متسامَح على CI` : `${RENDER_CAP_MS}ms`;
console.log(`  ${Object.keys(TEMPLATES).length} قالب · fps=${FPS} · حدّ الزمن ${capNote} · مخرَج مؤقّت في ${OUT_DIR}`);
console.log();

// نحسب عدد الإطارات لكل قالب من templateToTimeline قبل الرندر —
// حقيقيّاً لا تقديريّاً (WIRE-1-CLOSE ش٣ج).
function computeFrameCount(template) {
  const brand = resolveBrand(DEFAULT_BRAND);
  const canvas = new Canvas(1080, 1080);
  const ctx = canvas.getContext('2d');
  const plan = buildRenderPlan({
    ctx, size: { w: 1080, h: 1080 }, template, brand, content: CONTENT, fps: FPS,
  });
  const headlineLineCount = plan.headline?.linesJustified.length ?? 1;
  const timeline = templateToTimeline({
    template, brand: DEFAULT_BRAND, content: CONTENT, headlineLineCount, fps: FPS,
  });
  return Math.ceil(timeline.duration * FPS);
}

const results = [];
for (const [name, template] of Object.entries(TEMPLATES)) {
  const outPath = join(OUT_DIR, `${name}.mp4`);
  const frames = computeFrameCount(template);

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
    const countOK = inLoop === 0;
    // mk/528 · حالتان: (١) القياسُ الصارم ≤ RENDER_CAP_MS — لا تحذير.
    // (٢) في CI فقط: RENDER_CAP_MS < ms ≤ CI_HARD_CAP_MS ⇒ SLOW-CI (متسامَح · تحذيرٌ لا فشل).
    // (٣) ms > CI_HARD_CAP_MS ⇒ SLOW (فشل حتى في CI).
    const hardCap = TOLERATE_CI_SLOW ? CI_HARD_CAP_MS : RENDER_CAP_MS;
    let status;
    if (!countOK) status = 'IN_LOOP';
    else if (ms <= RENDER_CAP_MS) status = 'OK';
    else if (ms <= hardCap) status = 'SLOW_CI_TOLERATED';
    else status = 'SLOW';
    const mark = status === 'OK' || status === 'SLOW_CI_TOLERATED' ? (status === 'OK' ? '✓' : '⚠') : '✗';
    const label = status === 'SLOW_CI_TOLERATED' ? `SLOW-CI (tolerated · CI runner throttle)` : status;
    console.log(`  ${mark} ${name}: frames=${frames} · ms=${ms.toFixed(0)} · in-loop=${inLoop} · ${label}`);
    results.push({ name, status, ms, inLoop, frames });
  } catch (err) {
    const ms = performance.now() - t0;
    console.log(`  ✗ ${name}: frames=${frames} · ms=${ms.toFixed(0)} · in-loop=${counter} · فشل: ${err.message.slice(0, 100)}`);
    results.push({ name, status: 'FAIL', ms, inLoop: counter, frames, error: err.message });
  }
}

console.log();

// تنظيف
try { rmSync(OUT_DIR, { recursive: true }); } catch { /* noop */ }

const failed = results.filter((r) => r.status === 'FAIL');
const inLoopy = results.filter((r) => r.status === 'IN_LOOP');
const slow = results.filter((r) => r.status === 'SLOW');
const toleratedSlow = results.filter((r) => r.status === 'SLOW_CI_TOLERATED');

if (failed.length > 0 || inLoopy.length > 0 || slow.length > 0) {
  const hardCap = TOLERATE_CI_SLOW ? CI_HARD_CAP_MS : RENDER_CAP_MS;
  console.error(
    `✗ verify-render-video-all-templates FAILED — ` +
    `${failed.length} فشل · ${inLoopy.length} in-loop · ${slow.length} بطء`
  );
  for (const f of failed) console.error(`  فشل: ${f.name} · ${f.error?.slice(0, 100)}`);
  for (const l of inLoopy) console.error(`  in-loop: ${l.name} = ${l.inLoop} (المتوقّع 0 — الخطة غير مستهلَكة)`);
  for (const s of slow) console.error(`  بطء: ${s.name} = ${s.ms.toFixed(0)}ms (أعلى من ${hardCap}ms)`);
  process.exit(1);
}

if (toleratedSlow.length > 0) {
  console.log(
    `⚠ verify-render-video-all-templates PASSED (with CI tolerance) — ` +
    `${toleratedSlow.length} تجاوز(ت) السقفَ الصارم ${RENDER_CAP_MS}ms لكن ضمن السقف المتسامَح ${CI_HARD_CAP_MS}ms (mk/528 · runner throttle):`
  );
  for (const t of toleratedSlow) console.log(`  ⚠ ${t.name} = ${t.ms.toFixed(0)}ms`);
} else {
  console.log(
    `✓ verify-render-video-all-templates PASSED — ${results.length} قوالب · ` +
    `in-loop=0 و ms ≤ ${RENDER_CAP_MS} لكل واحد`
  );
}
process.exit(0);
