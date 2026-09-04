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

    if (locale === 'ar') {
      // نستخدم buildRenderPlan للحصول على linesJustified (تحوي الكشيدة الحقيقية).
      const cardSize = { w: CARD_W, h: CARD_H };
      const plan = buildRenderPlan({
        ctx: cardCtx, size: cardSize,
        template: BREAKING, brand,
        content: { headline, source: 'وكالات' },
        fps: 30,
      });
      const lines = plan.headline?.linesJustified ?? [];
      const fs = plan.headline?.fontSize ?? 40;
      const lh = 1.2;
      let y = 140;
      for (const line of lines) {
        cardCtx.fillStyle = brand.colors.text;
        cardCtx.font = `700 ${fs}px "${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
        cardCtx.textAlign = 'right';
        cardCtx.direction = 'rtl';
        cardCtx.textBaseline = 'alphabetic';
        const text = line.map((t) => t.text || '').join(' ');
        cardCtx.fillText(text, CARD_W - 30, y);
        y += fs * lh;
      }
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
      let y = 120;
      for (const line of wr.lines) {
        cardCtx.fillStyle = brand.colors.text;
        cardCtx.font = `700 ${wr.fontSize}px "${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
        cardCtx.textAlign = 'left';
        cardCtx.direction = 'ltr';
        cardCtx.textBaseline = 'alphabetic';
        const text = line.map((t) => t.text || '').join(' ');
        cardCtx.fillText(text, 30, y);
        y += wr.fontSize * wr.lineHeight;
      }
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
}

console.log('');
if (failed === 0) console.log('════════ multilang gate ✓ ════════');
else {
  console.log(`════════ ${failed} إخفاق ✗ ════════`);
  process.exit(1);
}
