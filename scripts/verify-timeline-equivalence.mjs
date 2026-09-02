// scripts/verify-timeline-equivalence.mjs — البوابة الحاسمة للمرحلة 3.7.
//
// **الهدف:** إثبات أن `timeline-v2.drawTimelineAt` ينتج بايت-بايت نفس
// مخرج @legacy `drawAt` عبر كل إطارات فيديو `breaking`.
//
// **المنهج:**
//   1. ابنِ RenderPlan @legacy مرة واحدة (يعطي المدة، prep العنوان،
//      قيم الحركة المحلولة).
//   2. عبّر عن نفس القالب/الهوية/المحتوى بنموذج `Timeline` v2 —
//      بمسارات وعناصر ومفاتيح ومؤثرات.
//   3. لكل إطار من `[0, duration]` عند 30fps:
//      • ارسم على canvas عبر @legacy drawAt → md5 للـPNG.
//      • ارسم على canvas آخر عبر drawTimelineAt v2 → md5 للـPNG.
//      • قارن. أي فرق يوقف السكربت مع تقرير الإطار.
//
// **دور هذه الأداة:** حراسة لا مصدر ثقة. حين ينجح 100% ⇒ v2 آمن كبديل.
// حين يفشل ⇒ v2 فقد سلوكاً — راجع الإطار المُبلَّغ ورقّم الفرق.

import { Canvas, FontLibrary } from 'skia-canvas';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  buildRenderPlan,
  drawAt,          // @legacy — المصدر الأوحد للحقيقة حتى الآن
  timelineV2,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'out/timeline-equivalence');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ── مُدخلات القياس ──────────────────────────────────
const SIZE = { w: 1080, h: 1350 };
const FPS = 30;
const CONTENT = {
  headline:
    'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};

const brand = resolveBrand(DEFAULT_BRAND);

// ── ابنِ خطة @legacy مرة واحدة ─────────────────────
const scratch = new Canvas(SIZE.w, SIZE.h);
const scratchCtx = scratch.getContext('2d');
const plan = buildRenderPlan({
  ctx: scratchCtx,
  size: SIZE,
  template: BREAKING,
  brand,
  content: CONTENT,
  fps: FPS,
});
const duration = plan.timeline.duration;
const outroDur = plan.timeline.outro;
const anims = plan.animations;
const headlinePrep = plan.headline;
if (!headlinePrep) throw new Error('لا headline في breaking prep — بنية ملف مكسورة');
const headlineLines = headlinePrep.linesJustified.length;

console.log(`[gate] breaking prep: duration=${duration}s outro=${outroDur}s lines=${headlineLines}`);
console.log(`[gate] animations:`, JSON.stringify(anims, null, 2));

// ── عبّر عن breaking بنموذج Timeline v2 ─────────────
// كل طبقة قالب = مسار بعنصر واحد يمتد على كامل المدة.
// الحركات موصّفة بـkeyframes ومؤثّرات. الترتيب حسب index تصاعدياً.

const badgeAnim = anims['badge'];
const headlineAnim = anims['headline'];
const sourceAnim = anims['source'];

const layerItem = (id, layerIndex, index) => ({
  id: `track-${id}`,
  type: 'media',
  index,
  items: [{
    id, start: 0, end: duration,
    effects: [{ type: 'template-layer', layerIndex }],
  }],
});

const animatedLayerItem = (id, layerIndex, index, anim, includePulse) => {
  const kfs = [
    { t: 0, opacity: 0, y: anim.slideY, ease: 'easeOutCubic' },
    { t: anim.fade, opacity: 1, y: 0 },
  ];
  const effects = [];
  if (includePulse && anim.pulse) {
    effects.push({
      type: 'pulse-around-center',
      amount: brand.motion.badgePulse,
      duration: 0.15,
      startOffset: 0,
    });
  }
  effects.push({ type: 'template-layer', layerIndex });
  return {
    id: `track-${id}`,
    type: 'media',
    index,
    items: [{
      id, start: anim.startAt, end: duration,
      keyframes: kfs, effects,
    }],
  };
};

const headlineTrack = {
  id: 'track-headline', type: 'text', index: 20,
  items: [{
    id: 'headline', start: 0, end: duration,
    effects: [{
      type: 'template-headline',
      layerIndex: 2, // فهرس طبقة headline في breaking
      stagger: headlineAnim.stagger,
      fade: headlineAnim.fade,
      slideY: headlineAnim.slideY,
      startOffset: headlineAnim.startAt,
    }],
  }],
};

const outroTrack = {
  id: 'track-outro', type: 'media', index: 100,
  items: [{
    id: 'outro', start: duration - outroDur, end: duration,
    effects: [{
      type: 'outro-black-overlay',
      startOffset: 0,
      duration: outroDur,
    }],
  }],
};

const timeline = {
  duration,
  fps: FPS,
  size: 'portrait',
  tracks: [
    layerItem('image', 0, 0),                                    // خلفية
    layerItem('gradient', 1, 10),                                 // gradient onlyIf
    headlineTrack,                                                // headline بـstagger
    animatedLayerItem('badge', 3, 30, badgeAnim, true),           // مع pulse
    animatedLayerItem('source', 4, 40, sourceAnim, false),
    layerItem('logo', 5, 50),
    outroTrack,
  ],
};

// ── دوال الرسم لكل مسار ──────────────────────────
function renderLegacy(t) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  drawAt({
    ctx, size: SIZE, template: BREAKING, brand,
    content: CONTENT, t, plan,
  });
  return canvas;
}

function renderV2(t) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  timelineV2.drawTimelineAt({
    ctx, size: SIZE, timeline, brand, template: BREAKING,
    content: CONTENT, headlinePrep, t,
  });
  return canvas;
}

const md5 = (buf) => createHash('md5').update(buf).digest('hex');

// ── الحلقة ─────────────────────────────────────────
const totalFrames = Math.ceil(duration * FPS) + 1;
console.log(`\n[gate] بدء المقارنة — ${totalFrames} إطاراً على ${FPS}fps × ${duration.toFixed(2)}s\n`);

let mismatches = 0;
const firstMismatches = [];
for (let f = 0; f < totalFrames; f++) {
  const t = f / FPS;
  const bufL = await renderLegacy(t).toBuffer('png');
  const bufV = await renderV2(t).toBuffer('png');
  const hL = md5(bufL);
  const hV = md5(bufV);
  if (hL !== hV) {
    mismatches++;
    if (firstMismatches.length < 3) {
      // احفظ الفرق للتشخيص
      writeFileSync(join(OUT_DIR, `frame-${f.toString().padStart(4, '0')}-legacy.png`), bufL);
      writeFileSync(join(OUT_DIR, `frame-${f.toString().padStart(4, '0')}-v2.png`), bufV);
      firstMismatches.push({ f, t, hL, hV, sizeL: bufL.length, sizeV: bufV.length });
    }
  }
}

// ── التقرير ────────────────────────────────────────
console.log('════════ بوابة التكافؤ ════════');
console.log(`إجمالي الإطارات: ${totalFrames}`);
console.log(`مطابقة:          ${totalFrames - mismatches}`);
console.log(`مختلفة:          ${mismatches}`);
console.log(`الحكم: ${mismatches === 0 ? '✓ تكافؤ تام — v2 آمن كبديل' : '✗ فقد سلوكياً — راجع الإطارات أدناه'}`);

if (mismatches > 0) {
  console.log('\nأوّل الاختلافات (حُفظت في out/timeline-equivalence/):');
  for (const m of firstMismatches) {
    console.log(`  frame ${m.f.toString().padStart(4, ' ')} · t=${m.t.toFixed(3)}s · legacy=${m.hL.slice(0, 8)}…(${m.sizeL}b) · v2=${m.hV.slice(0, 8)}…(${m.sizeV}b)`);
  }
  process.exit(1);
}
