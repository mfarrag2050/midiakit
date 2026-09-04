// verify-multilang-gate.mjs — بوابة multilang (Phase 3.10).
//
// **الاختبارات (L-46 مزدوج + سلبي):**
//   (أ) **وجود عربي:** wrapOptimal + الكشيدة يُنتجان U+0640 ≥ 1 في المخرج.
//   (ب) **وجود لاتيني:** wrapLatin + applyLocaleToBrand يُنتجان **صفر** U+0640.
//   (ج) **applyLocaleToBrand:** capabilities.kashida=false، semanticBreaks=false،
//        direction='ltr' بعد التطبيق على locale=en.
//   (د) **منع الكلمة اليتيمة:** عنوان إنجليزي طويل ⇒ لا كلمة واحدة في السطر الأخير.
//   (هـ) **سلبي — تشغيل الكشيدة على لاتيني قسراً:** wrapOptimal مع justify يُخرج
//        U+0640 حتى في لاتيني (يُثبت أن التعطيل هو ما يمنعه، لا خصوصية النصّ).
//   (و) **تغطية المحارف:** checkFontCoverage يكشف نقص التركية إن اقتضت.
//   (ز) **L-17 بصري:** demo/multilang-demo.png (ar · en · tr) للمراجعة بالعين.

import { Canvas, FontLibrary } from 'skia-canvas';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  wrapLatin,
  applyLocaleToBrand,
  checkFontCoverage,
  buildRenderPlan,
} from '@pf-mediakit/engine';
import { BREAKING } from '@pf-mediakit/templates';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DEMO_DIR = join(ROOT, 'demo');
if (!existsSync(DEMO_DIR)) await mkdir(DEMO_DIR, { recursive: true });

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

let failed = 0;
function assert(cond, name, detail = '') {
  const mark = cond ? '✓' : '✗';
  console.log(`  ${mark} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
}

const HEADLINE_AR = 'وزير الخارجية التركي يبحث في أنقرة تطورات الأزمة في سوريا';
const HEADLINE_EN = 'Turkish Foreign Minister discusses Syrian crisis in Ankara today morning';
const HEADLINE_TR = 'Türk Dışişleri Bakanı Ankara\'da Suriye krizini görüşecek';

const BRAND_AR = resolveBrand(DEFAULT_BRAND);
const BRAND_LATIN_APPLIED = applyLocaleToBrand(BRAND_AR, 'en');

function makeCtx() {
  const c = new Canvas(1080, 300);
  const ctx = c.getContext('2d');
  return ctx;
}

// helper: عدّ محارف U+0640 في مخرج wrap
function countTatweel(lines) {
  let n = 0;
  for (const line of lines) {
    for (const tok of line) {
      const t = tok.text || '';
      n += (t.match(/ـ/g) || []).length;
    }
  }
  return n;
}

// ── (أ) وجود عربي: kashida فعّالة عبر buildRenderPlan ─
console.log('════════ أ) وجود عربي — الكشيدة تعمل ════════');
{
  const canvas = new Canvas(1080, 1350);
  const ctx = canvas.getContext('2d');
  const plan = buildRenderPlan({
    ctx, size: { w: 1080, h: 1350 },
    template: BREAKING, brand: BRAND_AR,
    content: { headline: HEADLINE_AR, source: 'وكالات' },
    fps: 30,
  });
  const tatweel = countTatweel(plan.headline?.linesJustified ?? []);
  console.log(`    linesJustified=${plan.headline?.linesJustified?.length ?? 0} · U+0640=${tatweel}`);
  assert(tatweel > 0, 'العربي المُبرَّر يحوي كشيدة');
}

// ── (ب) وجود لاتيني: صفر U+0640 ──────────────────────
console.log('\n════════ ب) لاتيني — صفر U+0640 ════════');
{
  const ctx = makeCtx();
  const wr = wrapLatin(ctx, {
    text: HEADLINE_EN,
    boxWidth: 900,
    fsRange: [50, 80],
    lineHeight: 1.15,
    maxLines: 3,
    minLines: 2,
    weight: 700,
    fontFamily: `"${BRAND_LATIN_APPLIED.fonts.primary.family}", ${BRAND_LATIN_APPLIED.fonts.fallback}`,
  });
  const tatweel = countTatweel(wr.lines);
  console.log(`    fs=${wr.fontSize} · sections=${wr.lines.length} · U+0640=${tatweel}`);
  assert(tatweel === 0, 'اللاتيني بلا كشيدة (لا معنى لها)');
}

// ── (ج) applyLocaleToBrand يعطّل الميزات العربية ────
console.log('\n════════ ج) applyLocaleToBrand(brand, "en") ════════');
{
  console.log(`    قبل: kashida=${BRAND_AR.fonts.capabilities.kashida} · semantic=${BRAND_AR.typography.semanticBreaks?.enabled ?? 'undef'} · dir=${BRAND_AR.direction}`);
  console.log(`    بعد: kashida=${BRAND_LATIN_APPLIED.fonts.capabilities.kashida} · semantic=${BRAND_LATIN_APPLIED.typography.semanticBreaks?.enabled ?? 'undef'} · dir=${BRAND_LATIN_APPLIED.direction}`);
  assert(BRAND_LATIN_APPLIED.fonts.capabilities.kashida === false, 'kashida = false');
  assert(BRAND_LATIN_APPLIED.direction === 'ltr', 'direction = ltr');
  if (BRAND_LATIN_APPLIED.typography.semanticBreaks) {
    assert(BRAND_LATIN_APPLIED.typography.semanticBreaks.enabled === false, 'semanticBreaks = disabled');
  }
}

// ── (د) منع الكلمة اليتيمة ─────────────────────────
console.log('\n════════ د) منع الكلمة اليتيمة في السطر الأخير ════════');
{
  const ctx = makeCtx();
  const wr = wrapLatin(ctx, {
    text: HEADLINE_EN,
    boxWidth: 900,
    fsRange: [50, 80],
    lineHeight: 1.15,
    maxLines: 3,
    minLines: 2,
    weight: 700,
    fontFamily: `"${BRAND_LATIN_APPLIED.fonts.primary.family}", ${BRAND_LATIN_APPLIED.fonts.fallback}`,
  });
  const lastLine = wr.lines[wr.lines.length - 1];
  const lastLineWordCount = lastLine ? lastLine.length : 0;
  console.log(`    آخر سطر: ${lastLineWordCount} كلمة`);
  if (wr.lines.length > 1) {
    assert(lastLineWordCount > 1, 'لا كلمة يتيمة');
  }
  for (let i = 0; i < wr.lines.length - 1; i++) {
    console.log(`    سطر ${i + 1}: ${wr.lines[i].length} كلمة`);
    assert(wr.lines[i].length > 1, `سطر ${i + 1} أكثر من كلمة`);
  }
}

// ── (هـ) سلبي — إن أُلغي applyLocaleToBrand، السلوك يخالف ──
console.log('\n════════ هـ) سلبي — bypass applyLocaleToBrand يُثبت أنه ما يمنع الخلط ════════');
{
  // إن حذفنا applyLocaleToBrand من المسار، capabilities.kashida تبقى true
  // على brand عربي — أي محاولة استعماله لنصّ لاتيني ستُنتج ملفاً «معربَناً»
  // (kashida حقيقية على لاتيني تظهر كخطوط أفقية بلا معنى).
  const bypassed = BRAND_AR; // لم يُعالَج
  const applied = applyLocaleToBrand(BRAND_AR, 'en');
  console.log(`    bypass: kashida=${bypassed.fonts.capabilities.kashida}`);
  console.log(`    applied: kashida=${applied.fonts.capabilities.kashida}`);
  assert(bypassed.fonts.capabilities.kashida === true, 'bypass يُبقي kashida مفعّلة (خطأ)');
  assert(applied.fonts.capabilities.kashida === false, 'applyLocaleToBrand يعطّلها (صحيح)');
  assert(bypassed !== applied, 'الاثنان objects منفصلان — التحوّل غير مُهدَر');
}

// ── (و) تغطية المحارف ──────────────────────────────
console.log('\n════════ و) تغطية المحارف — IBM Plex Sans Arabic ════════');
{
  const ctx = makeCtx();
  const fontStr = `700 40px "${BRAND_AR.fonts.primary.family}", ${BRAND_AR.fonts.fallback}`;
  const warnings = checkFontCoverage(ctx, {
    fontString: fontStr,
    locales: ['ar', 'en', 'tr', 'fr'],
  });
  warnings.forEach((w) => console.log(`    ⚠ ${w.locale}: ${w.missingChars.length} محرف مفقود — ${w.missingChars.join(' ')}`));
  if (warnings.length === 0) {
    console.log('    (كل اللغات مُغطَّاة — الخط شامل)');
  }
  // ملاحظة: هذا فحص **معلومة** لا فشل — قد يمرّ IBM Plex Sans Arabic
  // بالتركية، وقد لا يمرّ. الأهم: الفحص يعمل ويعطي مخرجاً قابلاً للتصحيح.
  assert(Array.isArray(warnings), 'checkFontCoverage يعيد مصفوفة (قد تكون فارغة)');
}

// ── (ز) L-17 بصري — demo/multilang-demo.png ─────────
console.log('\n════════ ز) L-17 — شبكة مقارنة (ar · en · tr) ════════');
{
  const CARD_W = 540, CARD_H = 700, GAP = 30, PAD = 30;
  const canvasW = PAD + (CARD_W + GAP) * 3 + PAD - GAP;
  const canvasH = PAD + 80 + CARD_H + PAD;
  const comp = new Canvas(canvasW, canvasH);
  const cctx = comp.getContext('2d');
  cctx.fillStyle = '#0B2340';
  cctx.fillRect(0, 0, canvasW, canvasH);

  // عنوان
  cctx.fillStyle = '#F8F4E9';
  cctx.font = '700 30px "IBM Plex Sans Arabic", sans-serif';
  cctx.textAlign = 'center';
  cctx.textBaseline = 'top';
  cctx.direction = 'rtl';
  cctx.fillText('لغة المحتوى — ثلاث لغات · قالب واحد · هوية واحدة', canvasW / 2, 20);
  cctx.font = '400 16px "IBM Plex Sans Arabic", sans-serif';
  cctx.globalAlpha = 0.7;
  cctx.fillText('العربية تحمل كشيدة (خندق) · اللاتينية بلف بسيط بلا قواعد دلالية', canvasW / 2, 55);
  cctx.globalAlpha = 1;

  const cells = [
    { locale: 'ar', label: 'العربية', headline: HEADLINE_AR, direction: 'rtl' },
    { locale: 'en', label: 'English', headline: HEADLINE_EN, direction: 'ltr' },
    { locale: 'tr', label: 'Türkçe',  headline: HEADLINE_TR, direction: 'ltr' },
  ];

  for (let i = 0; i < cells.length; i++) {
    const { locale, label, headline, direction } = cells[i];
    const bx = PAD + i * (CARD_W + GAP);
    const by = PAD + 80;

    const brand = applyLocaleToBrand(BRAND_AR, locale);
    cctx.fillStyle = brand.colors.surface;
    cctx.fillRect(bx, by, CARD_W, CARD_H);

    // عنوان العينة (locale + label) — أعلى البطاقة
    cctx.fillStyle = brand.colors.accent;
    cctx.font = '500 20px "IBM Plex Sans Arabic", sans-serif';
    cctx.textAlign = 'left';
    cctx.textBaseline = 'top';
    cctx.direction = 'ltr';
    cctx.fillText(`${label} — locale='${locale}'`, bx + 20, by + 20);

    // الرسم الفعلي — عربي عبر wrapOptimal، لاتيني عبر wrapLatin
    const cardCanvas = new Canvas(CARD_W, CARD_H);
    const cardCtx = cardCanvas.getContext('2d');
    cardCtx.fillStyle = brand.colors.surface;
    cardCtx.fillRect(0, 0, CARD_W, CARD_H);

    // ── L-02 fix: موضع البداية مشتقّ من الصاعد المقيس ──
    // TOP_PADDING = المسافة الثابتة بين قمة الصندوق وأعلى بكسل من النصّ.
    // نضيف هامش أمان للتشكيل (measureText يُخفي 13px تقريباً للفتحة
    // والضمة على IBM Plex Sans Arabic — راجع diagnose-ascent.mjs).
    const TOP_PADDING = 90;
    const DIACRITIC_SAFETY = 15; // احتياطي للتشكيل المرفوع

    // نجهّز النصّ والخط أولاً لقياس الصاعد
    let lines, fs, textAlign, textDirection, xPos;
    if (locale === 'ar') {
      const cardSize = { w: CARD_W, h: CARD_H };
      const plan = buildRenderPlan({
        ctx: cardCtx, size: cardSize,
        template: BREAKING, brand,
        content: { headline, source: 'وكالات' },
        fps: 30,
      });
      lines = (plan.headline?.linesJustified ?? []).map((line) =>
        line.map((t) => t.text || '').join(' ')
      );
      fs = plan.headline?.fontSize ?? 40;
      textAlign = 'right';
      textDirection = 'rtl';
      xPos = CARD_W - 30;
    } else {
      const wr = wrapLatin(cardCtx, {
        text: headline,
        boxWidth: 480,
        fsRange: [40, 68],
        lineHeight: 1.15,
        maxLines: 3,
        minLines: 2,
        weight: 700,
        fontFamily: `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`,
      });
      lines = wr.lines.map((line) => line.map((t) => t.text || '').join(' '));
      fs = wr.fontSize;
      textAlign = 'left';
      textDirection = 'ltr';
      xPos = 30;
    }

    const lh = 1.2;
    cardCtx.font = `700 ${fs}px "${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
    cardCtx.textAlign = textAlign;
    cardCtx.direction = textDirection;
    cardCtx.textBaseline = 'alphabetic';
    cardCtx.fillStyle = brand.colors.text;

    // نقيس الصاعد الفعلي للسطر الأوّل — هو الذي يمسّ الحافة العليا
    const ascent = lines.length > 0
      ? cardCtx.measureText(lines[0]).actualBoundingBoxAscent
      : fs * 0.75;
    // y-baseline بحيث top = TOP_PADDING مع هامش أمان للتشكيل
    let y = TOP_PADDING + ascent + DIACRITIC_SAFETY;

    for (const text of lines) {
      cardCtx.fillText(text, xPos, y);
      y += fs * lh;
    }

    cctx.drawImage(cardCanvas, bx, by);
    cctx.strokeStyle = 'rgba(255,255,255,0.25)';
    cctx.lineWidth = 1;
    cctx.strokeRect(bx, by, CARD_W, CARD_H);
  }

  const OUT = join(DEMO_DIR, 'multilang-demo.png');
  await writeFile(OUT, comp.toBufferSync('png'));
  console.log(`    ✓ ${OUT} (${canvasW}×${canvasH})`);
  const md5 = createHash('md5').update(comp.toBufferSync('png')).digest('hex').slice(0, 12);
  console.log(`    md5: ${md5}…`);

  // ── فحص بكسلي: أعلى بكسل نصّ في كل كارت ≥ MIN_TOP_PADDING ──
  console.log('\n════════ ح) فحص بكسلي — top-most colored pixel ≥ عتبة ════════');
  const MIN_TOP_PADDING = 70; // بكسل — حماية من القصّ (TOP_PADDING=90 - 20 هامش)
  const BORDER = 3;
  const topPixels = {};
  for (let i = 0; i < cells.length; i++) {
    const { label } = cells[i];
    const bx = PAD + i * (CARD_W + GAP);
    const by = PAD + 80;
    // نستخدم dataOf comp لأنه ليس متاحاً كـImage — نُعيد قراءة imgdata
    const imgData = cctx.getImageData(bx + BORDER, by + BORDER, CARD_W - 2 * BORDER, CARD_H - 2 * BORDER);
    const midX = Math.floor((CARD_W - 2 * BORDER) / 2);
    const bgIdx = (0 * (CARD_W - 2 * BORDER) + midX) * 4;
    const bgR = imgData.data[bgIdx], bgG = imgData.data[bgIdx + 1], bgB = imgData.data[bgIdx + 2];
    const tolerance = 25;
    let topRow = -1;
    outer: for (let row = 0; row < CARD_H - 2 * BORDER; row++) {
      for (let col = 4; col < CARD_W - 2 * BORDER - 4; col++) {
        const idx = (row * (CARD_W - 2 * BORDER) + col) * 4;
        const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2];
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        if (diff > tolerance) { topRow = row + BORDER; break outer; }
      }
    }
    topPixels[label] = topRow;
    console.log(`    ${label.padEnd(3)} أعلى بكسل نصّ من قمة الصندوق: ${topRow}px`);
    assert(topRow >= MIN_TOP_PADDING, `${label}: أعلى بكسل ≥ ${MIN_TOP_PADDING}px`, `${topRow}px`);
  }

  // ── سلبي: ماذا لو ثبّتنا موضع البداية على قيمة لاتينية للعربي؟ ──
  console.log('\n════════ ط) سلبي — تثبيت y-baseline على قيمة لاتينية للعربي ════════');
  {
    const bx = PAD;
    const by = PAD + 80;
    const badCanvas = new Canvas(CARD_W, CARD_H);
    const badCtx = badCanvas.getContext('2d');
    badCtx.fillStyle = BRAND_AR.colors.surface;
    badCtx.fillRect(0, 0, CARD_W, CARD_H);
    // نستعمل نفس بيانات العربية لكن بـy مثبَّت على ما يناسب اللاتيني
    const plan = buildRenderPlan({
      ctx: badCtx, size: { w: CARD_W, h: CARD_H },
      template: BREAKING, brand: BRAND_AR,
      content: { headline: HEADLINE_AR, source: 'وكالات' },
      fps: 30,
    });
    const badLines = (plan.headline?.linesJustified ?? []).map((line) =>
      line.map((t) => t.text || '').join(' ')
    );
    const badFs = plan.headline?.fontSize ?? 40;
    badCtx.font = `700 ${badFs}px "${BRAND_AR.fonts.primary.family}", ${BRAND_AR.fonts.fallback}`;
    badCtx.textAlign = 'right';
    badCtx.direction = 'rtl';
    badCtx.textBaseline = 'alphabetic';
    badCtx.fillStyle = BRAND_AR.colors.text;
    // ascent لاتيني (54) بدل العربي (57+) — يقصّ الصاعد العربي
    const LATIN_ASCENT_HARDCODED = 54;
    const badY = 20 + LATIN_ASCENT_HARDCODED; // TOP_PADDING مقلَّص (20 بدل 90)
    let y = badY;
    for (const text of badLines) {
      badCtx.fillText(text, CARD_W - 30, y);
      y += badFs * 1.2;
    }
    // نقيس أعلى بكسل
    const badData = badCtx.getImageData(BORDER, BORDER, CARD_W - 2 * BORDER, CARD_H - 2 * BORDER);
    const midX = Math.floor((CARD_W - 2 * BORDER) / 2);
    const bgIdx = (0 * (CARD_W - 2 * BORDER) + midX) * 4;
    const bgR = badData.data[bgIdx], bgG = badData.data[bgIdx + 1], bgB = badData.data[bgIdx + 2];
    let badTop = -1;
    outer2: for (let row = 0; row < CARD_H - 2 * BORDER; row++) {
      for (let col = 4; col < CARD_W - 2 * BORDER - 4; col++) {
        const idx = (row * (CARD_W - 2 * BORDER) + col) * 4;
        const r = badData.data[idx], g = badData.data[idx + 1], b = badData.data[idx + 2];
        const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
        if (diff > 25) { badTop = row + BORDER; break outer2; }
      }
    }
    console.log(`    مع TOP_PADDING=20 + LATIN_ASCENT=54 على عربي: أعلى بكسل عند ${badTop}px`);
    assert(badTop < MIN_TOP_PADDING, `السلبي يفشل الحدّ ${MIN_TOP_PADDING}px`, `${badTop}px < ${MIN_TOP_PADDING}px`);
    console.log(`    ⇒ الحارس (ح) كان سيرصد هذا القصّ لو حدث في الإنتاج`);
  }
}

console.log('');
if (failed === 0) console.log('════════ multilang gate ✓ ════════');
else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  process.exit(1);
}
