// scripts/preview.mjs — معاينة كل القوالب لكل الهويات عبر renderFrame.
//
// **الاستخدام:**
//   pnpm preview                                          # brand=default template=breaking
//   pnpm preview -- --brand=client-demo
//   pnpm preview -- --template=plain
//   pnpm preview -- --brand=client-demo --template=all    # كل القوالب لهذه الهوية
//   pnpm preview -- --semantic=off                        # يفرض تعطيل الكسر الدلالي
//   pnpm preview -- --semantic=on                         # يفرض تفعيل الكسر الدلالي
//
// **بوابة المرحلة 2 (2026-08-31):** إضافة قالب `plain` (خامس بعد الأربعة
// الأصلية) بلا سطر كود — يُرسم من JSON فقط عبر renderFrame.
// **إغلاق الدَين (2026-08-31 لاحقة):** أُضيفت منفّذات kicker + accent
// + watermark، فأصبحت كل القوالب الستة تُرسم كاملة.
// **الجزء ب-2 (2026-09-01):** يُحمَّل ExtendedLexicon من data/external
// حين semantic=on، ويُمرَّر لـ renderFrame كـ`lexicon`. المُخرج يُوجَّه
// إلى `out/semantic/` أو `out/nosemantic/` — verify-snapshot يقارن كلاًّ
// بمرجعه (snapshots-semantic/ و snapshots/ على التوالي).

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve as pathResolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  resolveBrand,
  createCanvasMeasurer,
  detectFontCaps,
  renderFrame,
  loadDefaultLexicon,
  extendLexicon,
} from '@pf-mediakit/engine';
import { TEMPLATES } from '@pf-mediakit/templates';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── وسائط سطر الأوامر ─────────────────────────────────
function parseArgs() {
  // semantic: 'default' | 'on' | 'off' — 'default' يحترم brand.typography.semanticBreaks
  // diacritize: false | true — يستدعي خدمة التشكيل قبل الرندر
  const args = {
    brand: 'default',
    template: 'breaking',
    semantic: 'default',
    diacritize: false,
    diacritizerUrl: 'http://127.0.0.1:19080',
  };
  for (const arg of process.argv.slice(2)) {
    const brandMatch = arg.match(/^--brand=(.+)$/);
    if (brandMatch) args.brand = brandMatch[1];
    const tplMatch = arg.match(/^--template=(.+)$/);
    if (tplMatch) args.template = tplMatch[1];
    const semMatch = arg.match(/^--semantic=(default|on|off)$/);
    if (semMatch) args.semantic = semMatch[1];
    if (arg === '--diacritize') args.diacritize = true;
    const urlMatch = arg.match(/^--diacritizer-url=(.+)$/);
    if (urlMatch) args.diacritizerUrl = urlMatch[1];
  }
  return args;
}

/**
 * يستدعي خدمة التشكيل مع تراجع صامت. عند تعذّر الاتصال أو خطأ نموذج،
 * يُطبع تحذير ويُرجَع النص كما هو — لا فشل صعب (L-04: احترام حدود
 * النظام؛ هنا الحدّ خدمة خارجية اختيارية).
 */
async function diacritizeText(text, url) {
  try {
    const resp = await fetch(`${url}/diacritize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      console.warn(`[preview] diacritizer HTTP ${resp.status} — تمرير النص كما هو`);
      return text;
    }
    const data = await resp.json();
    return data.text ?? text;
  } catch (err) {
    console.warn(`[preview] تعذّر الاتصال بخدمة التشكيل (${url}): ${err.message} — تمرير النص كما هو`);
    return text;
  }
}

const CLI = parseArgs();

// ── تحميل الهوية ──────────────────────────────────────
async function loadBrandRaw(name) {
  if (name === 'default') return DEFAULT_BRAND;
  const path = join(ROOT, 'brands', `${name}.json`);
  if (!existsSync(path)) throw new Error(`brands/${name}.json غير موجود`);
  return JSON.parse(await readFile(path, 'utf8'));
}

const brandRaw = await loadBrandRaw(CLI.brand);
// تطبيق قرار --semantic إن لم يكن default
function applySemanticOverride(raw, mode) {
  if (mode === 'default') return raw;
  return {
    ...raw,
    typography: {
      ...raw.typography,
      semanticBreaks: {
        ...(raw.typography?.semanticBreaks ?? {}),
        enabled: mode === 'on',
      },
    },
  };
}
// تفعيل التشكيل في الهوية عند --diacritize — يُفعِّل تلقائياً dynamic
// lineHeight داخل المحرك (docs/07 §3).
function applyDiacriticsOverride(raw, on) {
  if (!on) return raw;
  return {
    ...raw,
    typography: {
      ...raw.typography,
      diacritics: {
        ...(raw.typography?.diacritics ?? {}),
        enabled: true,
      },
    },
  };
}
const brandAdjusted = applyDiacriticsOverride(
  applySemanticOverride(brandRaw, CLI.semantic),
  CLI.diacritize
);
const brand = resolveBrand(brandAdjusted);

// ── تحميل ExtendedLexicon (يُمرَّر فقط حين semantic مفعّل) ──
const DATA_DIR = join(ROOT, 'data/external');
let extLex = null;
if (brand.typography.semanticBreaks.enabled) {
  const [placesRaw, entitiesRaw, titlesRaw] = await Promise.all([
    readFile(join(DATA_DIR, 'places.json'), 'utf8'),
    readFile(join(DATA_DIR, 'entities.json'), 'utf8'),
    readFile(join(DATA_DIR, 'titles.json'), 'utf8'),
  ]);
  const places = JSON.parse(placesRaw).places;
  const entities = JSON.parse(entitiesRaw).entities;
  const titles = JSON.parse(titlesRaw).titles;
  extLex = extendLexicon(loadDefaultLexicon(), { titles, places, entities });
  console.log(
    `[preview] lexicon: places=${places.length} entities=${entities.length} titles=${titles.length}`
  );
}

// ── تسجيل الخط ديناميكياً ─────────────────────────────
const FONTS_DIR = join(ROOT, 'assets/fonts');
const IBM_PLEX_FALLBACK = [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
];

function resolveFontPath(url) {
  if (!url) return null;
  return isAbsolute(url) ? url : pathResolve(ROOT, url);
}

const weights = brand.fonts.primary.weights;
const fontPaths = [weights.light.url, weights.regular.url, weights.bold.url]
  .map(resolveFontPath)
  .filter(Boolean);

if (fontPaths.length > 0) {
  FontLibrary.use(brand.fonts.primary.family, fontPaths);
  console.log(
    `[preview] font: ${brand.fonts.primary.family} (${fontPaths.length} أوزان من brand.json)`
  );
} else {
  FontLibrary.use(brand.fonts.primary.family, IBM_PLEX_FALLBACK);
  console.log(
    `[preview] font: ${brand.fonts.primary.family} (تراجع IBM Plex — brand بلا مسارات)`
  );
}

// ── الثوابت ───────────────────────────────────────────
const HEADLINE_LONG =
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';
const HEADLINE_MED = 'مؤتمر السلام الدولي ينطلق _غداً_ في بروكسل';
const HEADLINE_SHORT = 'قمة عربية طارئة';
const TITLE_REEL = 'الحرب في غزة';
const KICKER_TEXT = 'تقرير خاص';
const LOCATION = 'غزة';
const SOURCE_TEXT = 'مصدر طبي للأناضول';

/**
 * محتوى مناسب لكل قالب — يعكس ما ستفعله الواجهة عند استيفاء الحقول.
 * أيّ قالب يستعمل كلمة مميّزة `_word_` يبيّن التمييز البصري (accent span).
 */
const CONTENT_BY_TEMPLATE = {
  breaking: { headline: HEADLINE_LONG, source: SOURCE_TEXT },
  card_centered: { headline: HEADLINE_MED }, // يحوي _غداً_ لإبراز accent span
  card_bottom: { headline: HEADLINE_MED },
  card_kicker: { kicker: KICKER_TEXT, headline: HEADLINE_SHORT },
  reel: { title: TITLE_REEL, location: LOCATION },
  plain: { headline: HEADLINE_LONG },
};

const SIZE = { w: 1080, h: 1350 };
// ── مجلد المخرجات ───────────────────────────────────
// نستعمل subdir حسب حالة الدلالي — verify-snapshot يقارن كلاً بمرجعه.
const semanticActive = brand.typography.semanticBreaks.enabled;
const OUT_SUBDIR = semanticActive ? 'semantic' : 'nosemantic';
const OUT_DIR = join(ROOT, 'out', OUT_SUBDIR);
if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
// مجلد جذر out/ يبقى للملفَين الأحاديَّين (preview-semantic.png، preview-nosemantic.png).
const OUT_ROOT = join(ROOT, 'out');
if (!existsSync(OUT_ROOT)) await mkdir(OUT_ROOT, { recursive: true });

// ── كشف قدرات الخط لمرة واحدة ─────────────────────────
{
  const probe = new Canvas(10, 10);
  const probeMeasure = createCanvasMeasurer(probe.getContext('2d'), brand);
  const detected = detectFontCaps(probeMeasure, 80);
  console.log(
    `[preview] detectFontCaps: kashida=${detected.kashida} method=${detected.kashidaMethod}`
  );
}

// ── دالة الرندر ───────────────────────────────────────
async function renderOne(templateId, kashidaOn) {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(
      `[preview] template=${templateId} غير معروف. المتاح: ${Object.keys(TEMPLATES).join(', ')}`
    );
  }
  const rawContent = CONTENT_BY_TEMPLATE[templateId] ?? {};
  // التشكيل يجري على مستوى النص **قبل** استدعاء المحرك — المحرك يستقبل
  // نصاً مشكّلاً كأيّ نص. لا تبعية بايثون في packages/engine.
  let content = rawContent;
  if (CLI.diacritize && typeof rawContent.headline === 'string') {
    content = { ...rawContent, headline: await diacritizeText(rawContent.headline, CLI.diacritizerUrl) };
  }

  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');

  const brandForFrame = kashidaOn
    ? brand
    : {
        ...brand,
        typography: {
          ...brand.typography,
          justify: { ...brand.typography.justify, mode: 'none' },
        },
      };

  renderFrame({
    ctx,
    size: SIZE,
    template,
    brand: brandForFrame,
    content,
    ...(extLex && { lexicon: extLex }),
  });

  const suffix = templateId === 'breaking' ? '' : `-${templateId.replace(/_/g, '-')}`;
  const kashidaSuffix = kashidaOn ? '' : '-nokashida';
  const outPath = join(OUT_DIR, `preview-${CLI.brand}${suffix}${kashidaSuffix}.png`);
  await canvas.toFile(outPath);
  return outPath;
}

// ── تنفيذ ─────────────────────────────────────────────
const templatesToRun =
  CLI.template === 'all' ? Object.keys(TEMPLATES) : [CLI.template];

console.log(
  `[preview] brand=${brand.id} · قوالب=${templatesToRun.join(',')} · قماش=${SIZE.w}×${SIZE.h} · semantic=${semanticActive ? 'on' : 'off'} · diacritics=${CLI.diacritize ? 'on' : 'off'} (${OUT_SUBDIR}/)`
);

for (const tplId of templatesToRun) {
  const outK = await renderOne(tplId, true);
  const outN = await renderOne(tplId, false);
  console.log(`   ${tplId.padEnd(14)} → ${outK.replace(ROOT + '/', '')} (kashida)`);
  console.log(`   ${' '.repeat(14)}   ${outN.replace(ROOT + '/', '')} (بلا)`);
}

// ── ملفَي المراجعة البصرية للمالك ────────────────────
// عند brand=default && template=breaking (أو all)، ننسخ لقطة الكشيدة إلى
// out/preview-semantic.png / preview-nosemantic.png / preview-diacritics.png
// حسب حالة العلامات — يقارنها المالك جنباً إلى جنب.
if (CLI.brand === 'default' && templatesToRun.includes('breaking')) {
  const src = join(OUT_DIR, `preview-default.png`);
  let destName;
  if (CLI.diacritize) destName = 'preview-diacritics.png';
  else if (semanticActive) destName = 'preview-semantic.png';
  else destName = 'preview-nosemantic.png';
  const dst = join(OUT_ROOT, destName);
  if (existsSync(src)) {
    await copyFile(src, dst);
    console.log(`   ↪ ${dst.replace(ROOT + '/', '')} (مراجعة بصرية)`);
  }
}
