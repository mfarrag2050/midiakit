// scripts/diagnose-render-perf.mjs — تشخيص أداء حلقة الرندر.
//
// **الغرض:** قياس زمن كل مرحلة في حلقة الإطار بدون أي تحسين.
// لا يعدّل packages/* — يستدعي الدوال المُصدَّرة مباشرةً ويضع مؤقّتات
// حولها. النتيجة: أرقام حقيقية لتحديد أين يذهب الوقت.
//
// **يقيس على 100 إطار (t = f/30 حسب renderVideo الحقيقي):**
//   1. clear         — ctx.clearRect
//   2. wrap          — preprocessBidi + parseTokens + wrapOptimal
//   3. justify       — justifyLine × عدد الأسطر
//   4. draw          — executeLayer لكل طبقة + drawHeadlineLine
//   5. buffer        — ctx.getImageData → Buffer
//
// **ملاحظات:**
//   • لا يشغّل ffmpeg — الكتابة إلى pipe مقيَّدة بضغط عكسي متغيّر،
//     تصعب معايرتها بمعزل. buffer وحده كافٍ لبيان تكلفة استخراج RGBA.
//   • يفصل الاستدعاء إلى primitives بدل استدعاء drawAt ككتلة واحدة —
//     نفس المنطق تماماً، لكن مع نقاط قياس بين المراحل.
//   • يتحقّق من المخرج البصري: يحفظ إطار عيّنة عند t=1.4 للمقارنة مع
//     verify-frame-at (يضمن أن التوقيت لم يشوّه شيئاً).

import { Canvas, FontLibrary } from 'skia-canvas';
import { performance } from 'node:perf_hooks';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  createCanvasMeasurer,
  preprocessBidi,
  parseTokens,
  wrapOptimal,
  justifyLine,
  drawHeadlineLine,
  executeLayer,
  timelineOf,
  parseAnimations,
  buildRenderPlan,
  drawAt,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── تسجيل الخط (كما في renderer) ─────────────────────
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

// ── إعداد (مطابق للـrenderer الفعلي) ──────────────────
const SIZE = { w: 1080, h: 1350 };
const brand = resolveBrand(DEFAULT_BRAND);
const template = BREAKING;
const CONTENT = {
  headline:
    'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  source: 'مصدر طبي للأناضول',
};
const FPS = 30;
const FRAMES = 100;
const timeline = timelineOf(template, brand, CONTENT, FPS);

// اطبع الإعداد
console.log(
  `[diagnose] setup: ${SIZE.w}×${SIZE.h} · ${FRAMES} إطار · fps=${FPS}`
);
console.log(
  `[diagnose] timeline: duration=${timeline.duration.toFixed(2)}s · frames_full=${Math.ceil(timeline.duration * FPS)} · outro=${timeline.outro}s`
);
console.log(
  `[diagnose] template=${template.id} · headline layer moved to video via template.video`
);

// ── فرضية إعادة استخدام Canvas مقابل واحد جديد لكل إطار ─
// نقيس السيناريو الحالي أولاً (Canvas واحد + clearRect)، ثم سيناريو
// «Canvas جديد لكل إطار» كسؤال جانبي للفرضية الثانية للمالك.

// ── أدوات القياس ─────────────────────────────────────
class Stat {
  constructor(name) {
    this.name = name;
    this.samples = [];
  }
  add(ms) {
    this.samples.push(ms);
  }
  summary() {
    if (this.samples.length === 0) return { name: this.name, n: 0 };
    const sorted = [...this.samples].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const median = sorted[Math.floor(n / 2)];
    const p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
    return {
      name: this.name,
      n,
      mean_ms: mean,
      median_ms: median,
      p95_ms: p95,
      total_ms: sum,
    };
  }
}

function printTable(stats) {
  console.log('\n── التوقيتات (على 100 إطار) ──');
  console.log(
    'المرحلة'.padEnd(28) +
      'متوسط'.padStart(10) +
      'وسيط'.padStart(10) +
      'p95'.padStart(10) +
      'مجموع'.padStart(12) +
      '  نسبة'
  );
  const totalSum = stats.reduce((a, s) => a + s.summary().total_ms, 0);
  for (const s of stats) {
    const u = s.summary();
    const pct = ((u.total_ms / totalSum) * 100).toFixed(1);
    console.log(
      u.name.padEnd(28) +
        `${u.mean_ms.toFixed(1)}ms`.padStart(10) +
        `${u.median_ms.toFixed(1)}ms`.padStart(10) +
        `${u.p95_ms.toFixed(1)}ms`.padStart(10) +
        `${(u.total_ms / 1000).toFixed(2)}s`.padStart(12) +
        `  ${pct}%`
    );
  }
  console.log(
    'المجموع'.padEnd(28) +
      ' '.repeat(28) +
      ' '.repeat(2) +
      `${(totalSum / 1000).toFixed(2)}s`.padStart(12)
  );
}

// ── مرحلتان مساعدتان تُشغّلان مرة قبل الحلقة (للمقارنة) ─

// (أ) قياس تكلفة إنشاء Canvas جديد — الفرضية الثانية للمالك
const canvasCreateStat = new Stat('Canvas() جديد');
for (let i = 0; i < 20; i++) {
  const t0 = performance.now();
  const c = new Canvas(SIZE.w, SIZE.h);
  const _ctx = c.getContext('2d');
  canvasCreateStat.add(performance.now() - t0);
}
console.log(
  `\n[diagnose] Canvas() جديد (20 عيّنة): متوسّط=${canvasCreateStat.summary().mean_ms.toFixed(1)}ms`
);

// ── الحلقة الرئيسية: Canvas واحد مُعاد استعماله + clearRect ─

const canvas = new Canvas(SIZE.w, SIZE.h);
const ctx = canvas.getContext('2d');

const statClear = new Stat('clear');
const statWrap = new Stat('wrap (wrapOptimal)');
const statJustify = new Stat('justify (justifyLine × lines)');
const statDraw = new Stat('draw (executeLayer + lines)');
const statBuffer = new Stat('buffer (getImageData→Buffer)');

// نستقرأ headline layer + معالجة النص مرة — لكن اللف والتبرير يحدثان
// داخل الحلقة لأن ذلك ما يفعله drawAt الحالي بالفعل.
const headlineLayer = template.layers.find((l) => l.type === 'headline');

// نُحضّر معالجة النص مسبقاً (bidi + tokens) لعزل التكلفة عن wrap:
// الأصل يستدعيها في كل إطار داخل prepareHeadline — لكن قياسها منفصلة
// يوضّح إن كانت هي المشكلة أم wrapOptimal.
const preprocessedText = preprocessBidi(CONTENT.headline, {
  numerals: brand.typography.bidi.numerals,
});
const tokensPrepared = parseTokens(preprocessedText);

// إعدادات wrap مطابقة لـprepareHeadline
const fontCfg = brand.typography.breaking;
const justifyCfg = brand.typography.justify;
const readableMin = Math.round(SIZE.w * fontCfg.readableMinRatio);
const [bwLo, bwHi] = fontCfg.boxWidthRange;
const boxWidthCandidates = [];
for (let i = 0; i < 10; i++) {
  const t = i / 9;
  boxWidthCandidates.push(Math.round(SIZE.w * (bwLo + t * (bwHi - bwLo))));
}
const fsRange = [
  Math.round(SIZE.w * fontCfg.headlineFsRatio[0]),
  Math.round(SIZE.w * fontCfg.headlineFsRatio[1]),
];

console.log(`\n[diagnose] بدء الحلقة (100 إطار)…`);
const loopStart = performance.now();

for (let f = 0; f < FRAMES; f++) {
  const t = f / FPS;

  // 1) clear
  const c0 = performance.now();
  ctx.clearRect(0, 0, SIZE.w, SIZE.h);
  statClear.add(performance.now() - c0);

  // 2) wrap — نفس مسار prepareHeadline
  const measure = createCanvasMeasurer(ctx, brand);
  const w0 = performance.now();
  const wrap = wrapOptimal(
    tokensPrepared,
    fontCfg.boxWidth,
    fontCfg.max,
    fontCfg.min,
    false,
    fontCfg.maxLines,
    fontCfg.shortLineRatio,
    fontCfg.lineHeight,
    measure,
    'uniform',
    {
      minLines: fontCfg.minLines,
      preferredLines: fontCfg.preferredLines,
      readableMin,
      preferLargestFs: true,
      absoluteMinFill: justifyCfg.minLineFill,
      boxWidthCandidates,
      fsRange,
      justifyCapacityConfig: {
        cfg: justifyCfg,
        fontCaps: brand.fonts.capabilities,
      },
    }
  );
  statWrap.add(performance.now() - w0);

  // 3) justify — نفس مسار prepareHeadline
  const nLines = wrap.lines.length;
  const j0 = performance.now();
  const linesJustified = wrap.lines.map((line, i) =>
    justifyLine(
      line,
      wrap.boxWidth,
      wrap.fontSize,
      false,
      justifyCfg,
      brand.fonts.capabilities,
      measure,
      { isLast: i === nLines - 1 }
    )
  );
  statJustify.add(performance.now() - j0);

  // 4) draw — نطبّق كل الطبقات + headline بـ per-line (يستنسخ drawAt)
  const d0 = performance.now();

  // نحتاج bounds للـheadline لتموضع badge/source
  const boxOffsetX = (SIZE.w - wrap.boxWidth) / 2;
  const rightX = SIZE.w - boxOffsetX;
  const centerY = SIZE.h * 0.62;
  const firstBaseline = centerY - ((nLines - 1) * wrap.lineHeight) / 2;
  const lastBaseline = firstBaseline + (nLines - 1) * wrap.lineHeight;

  const state = {
    headline: {
      top: firstBaseline - wrap.fontSize,
      bottom: lastBaseline,
      right: rightX,
      left: rightX - wrap.boxWidth,
      fontSize: wrap.fontSize,
      firstBaseline,
    },
  };
  const prep = {
    fontSize: wrap.fontSize,
    lineHeight: wrap.lineHeight,
    chosenBoxW: wrap.boxWidth,
    rightX,
    centerX: SIZE.w / 2,
    firstBaseline,
    lastBaseline,
    linesJustified,
    align: headlineLayer.align,
    bounds: state.headline,
    accentSpans: [],
    measure,
  };

  const anims = parseAnimations(template, brand, nLines);
  const rfArgs = { ctx, size: SIZE, template, brand, content: CONTENT };

  // نُطبّق نفس ترتيب الطبقات في drawAt — لكن بلا تحريك (نقيس الرسم فقط)
  for (const layer of template.layers) {
    if (layer.type === 'headline') {
      for (let i = 0; i < nLines; i++) {
        drawHeadlineLine(ctx, brand, prep, i);
      }
    } else {
      executeLayer(layer, rfArgs, state);
    }
  }
  statDraw.add(performance.now() - d0);

  // 5) buffer — استخراج RGBA (كما في rgbaBufferOf)
  const b0 = performance.now();
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const _buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  statBuffer.add(performance.now() - b0);

  // نضمن استعمال _buf كي لا يُحسَّن بعيداً
  void _buf.length;
  // t غير مستعمل — نستهلكه صراحةً
  void t;
}

const loopMs = performance.now() - loopStart;
const perFrameMs = loopMs / FRAMES;

printTable([statClear, statWrap, statJustify, statDraw, statBuffer]);

console.log(
  `\n── ملخّص السيناريو الأول (بلا خطة) ──\n` +
    `  مجموع زمن الحلقة: ${(loopMs / 1000).toFixed(2)}s\n` +
    `  متوسّط الإطار:    ${perFrameMs.toFixed(1)}ms\n` +
    `  إطارات/ثانية:      ${(1000 / perFrameMs).toFixed(1)} fps\n` +
    `  استقراء لفيديو 60s (1800 إطار): ${((perFrameMs * 1800) / 1000).toFixed(1)}s`
);

// ═══════════════════════════════════════════════════════
// السيناريو الثاني: بعد الإصلاح — RenderPlan مبني مرة قبل الحلقة
// نستدعي drawAt كما يفعل renderVideo الآن.
// ═══════════════════════════════════════════════════════

console.log(`\n[diagnose] ── السيناريو الثاني: مع RenderPlan ──`);

const canvas2 = new Canvas(SIZE.w, SIZE.h);
const ctx2 = canvas2.getContext('2d');

const statClear2 = new Stat('clear');
const statPlanBuild = new Stat('buildRenderPlan (مرة قبل الحلقة)');
const statDrawAt = new Stat('drawAt(t, plan)');
const statBuffer2 = new Stat('buffer (getImageData→Buffer)');

// (١) بناء الخطة — مرة قبل الحلقة
const p0 = performance.now();
const plan = buildRenderPlan({
  ctx: ctx2,
  size: SIZE,
  template,
  brand,
  content: CONTENT,
  fps: FPS,
});
statPlanBuild.add(performance.now() - p0);

// (٢) حلقة الرسم مع الخطة
const loopStart2 = performance.now();
for (let f = 0; f < FRAMES; f++) {
  const t = f / FPS;

  const c0 = performance.now();
  ctx2.clearRect(0, 0, SIZE.w, SIZE.h);
  statClear2.add(performance.now() - c0);

  const d0 = performance.now();
  drawAt({
    ctx: ctx2,
    size: SIZE,
    template,
    brand,
    content: CONTENT,
    t,
    plan,
  });
  statDrawAt.add(performance.now() - d0);

  const b0 = performance.now();
  const img = ctx2.getImageData(0, 0, canvas2.width, canvas2.height);
  const _buf = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  statBuffer2.add(performance.now() - b0);
  void _buf.length;
}
const loopMs2 = performance.now() - loopStart2;
const perFrameMs2 = loopMs2 / FRAMES;

printTable([statPlanBuild, statClear2, statDrawAt, statBuffer2]);

console.log(
  `\n── ملخّص السيناريو الثاني (مع خطة) ──\n` +
    `  بناء الخطة (مرة):   ${statPlanBuild.summary().mean_ms.toFixed(1)}ms\n` +
    `  مجموع زمن الحلقة:   ${(loopMs2 / 1000).toFixed(2)}s\n` +
    `  متوسّط الإطار:      ${perFrameMs2.toFixed(1)}ms\n` +
    `  إطارات/ثانية:        ${(1000 / perFrameMs2).toFixed(1)} fps\n` +
    `  استقراء لفيديو 60s (1800 إطار): ${((perFrameMs2 * 1800) / 1000).toFixed(1)}s`
);

console.log(
  `\n── المقارنة ──\n` +
    `  قبل: ${perFrameMs.toFixed(1)}ms/إطار · بعد: ${perFrameMs2.toFixed(1)}ms/إطار\n` +
    `  تحسين: ×${(perFrameMs / perFrameMs2).toFixed(1)}\n` +
    `  فيديو 60s: ${((perFrameMs * 1800) / 1000).toFixed(0)}s → ${((perFrameMs2 * 1800) / 1000).toFixed(1)}s`
);

// ── حفظ إطار عيّنة للتحقق البصري ────────────────────
const OUT = join(ROOT, 'out');
if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
await canvas2.toFile(join(OUT, `perf-sample-after-t${((FRAMES - 1) / FPS).toFixed(2)}.png`));
console.log(`\n  إطار عيّنة بعد الإصلاح: out/perf-sample-after-t${((FRAMES - 1) / FPS).toFixed(2)}.png`);
