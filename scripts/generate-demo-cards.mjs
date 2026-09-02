// scripts/generate-demo-cards.mjs — يولّد ست لقطات (3 عناوين × before/after)
// لأداة البيع. **يُحفَظ في `demo/` لا `out/`** حتى لا تُمسح مع التنظيف.
//
// العناوين مختارة من مسح 265 عنوان RSS (find-demo-candidates.mjs) —
// كل واحد يظهر أوضح أثر لقاعدة مختلفة:
//
//   (١) particle — «من» حرف جر (BREAK_INFINITY)
//   (٢) place    — «دير الزور» اسم مركّب في places.json (BREAK_STRONG)
//   (٣) title    — «مدرب» لقب في titles.json (BREAK_STRONG)

import { Canvas, FontLibrary } from 'skia-canvas';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import {
  resolveBrand,
  renderFrame,
  buildRenderPlan,
  loadDefaultLexicon,
  extendLexicon,
} from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const SIZE = { w: 1080, h: 1350 };
const DEMO_DIR = join(ROOT, 'demo');
if (!existsSync(DEMO_DIR)) await mkdir(DEMO_DIR, { recursive: true });

// ── تحميل ExtendedLexicon ───────────────────────────
const places = JSON.parse(readFileSync(join(ROOT, 'data/external/places.json'), 'utf8')).places;
const entities = JSON.parse(readFileSync(join(ROOT, 'data/external/entities.json'), 'utf8')).entities;
const titles = JSON.parse(readFileSync(join(ROOT, 'data/external/titles.json'), 'utf8')).titles;
const extLex = extendLexicon(loadDefaultLexicon(), { titles, places, entities });

// ── الهويّتان ───────────────────────────────────────
const brandOff = resolveBrand({
  ...DEFAULT_BRAND,
  typography: {
    ...DEFAULT_BRAND.typography,
    semanticBreaks: { ...DEFAULT_BRAND.typography.semanticBreaks, enabled: false },
  },
});
const brandOn = resolveBrand(DEFAULT_BRAND); // enabled=true افتراضياً

// ── العناوين المختارة ───────────────────────────────
const DEMOS = [
  {
    id: 1,
    ruleTag: 'particle',
    ruleLabel: 'حرف جر (BREAK_INFINITY)',
    source: 'aawsat',
    headline: 'الاتحاد الأوروبي يحذّر صربيا من تكريم مجرم الحرب ملاديتش',
    trigger: 'الكسر بعد «من» — حرف جر ملازم لمجروره — يُمنع دلالياً.',
  },
  {
    id: 2,
    ruleTag: 'place',
    ruleLabel: 'اسم مركّب في places.json (BREAK_STRONG)',
    source: 'aljazeera',
    headline: 'سوريا.. بدء ضخ الغاز من حقل كونيكو في دير الزور لدعم قطاع الكهرباء',
    trigger: '«دير الزور» زوج معروف من GeoNames — لا يُفصل بين طوكنَيه.',
  },
  {
    id: 3,
    ruleTag: 'title',
    ruleLabel: 'لقب في titles.json (BREAK_STRONG)',
    source: 'aawsat',
    headline: 'تجديد عقد حسام حسن مدرب منتخب مصر حتى 2030',
    trigger: '«مدرب» لقب مهني — رابطة قوية مع الاسم/المنصب الذي يليه.',
  },
];

// ── الرسم ───────────────────────────────────────────
async function renderCard(headline, semanticOn, outPath) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const brand = semanticOn ? brandOn : brandOff;
  const content = { headline, source: 'المصدر' };
  renderFrame({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content,
    ...(semanticOn && { lexicon: extLex }),
  });
  await canvas.toFile(outPath);
}

function measureLayout(headline, semanticOn) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const brand = semanticOn ? brandOn : brandOff;
  const plan = buildRenderPlan({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content: { headline, source: 'المصدر' },
    ...(semanticOn && { lexicon: extLex }),
    fps: 30,
  });
  const h = plan.headline;
  return {
    fs: h.fontSize,
    lines: h.linesJustified.map((l) => l.map((t) => t.text ?? '').join(' ')),
  };
}

// ── التنفيذ + التقرير ──────────────────────────────
const report = [];
report.push('# demo — لقطات مقارنة قبل/بعد الكسر الدلالي');
report.push('');
report.push('العناوين مختارة من مسح 265 عنوان RSS. كل واحد يُظهر أثر قاعدة');
report.push('مختلفة — ما لا تفعله Canva ولا أي أداة تصميم عربية.');
report.push('');
report.push('التمييز البصري بين الملفَين: `-before.png` = enabled=false،');
report.push('`-after.png` = enabled=true + ExtendedLexicon (places · entities · titles).');
report.push('');

for (const d of DEMOS) {
  const beforePath = join(DEMO_DIR, `demo-${d.id}-before.png`);
  const afterPath = join(DEMO_DIR, `demo-${d.id}-after.png`);
  await renderCard(d.headline, false, beforePath);
  await renderCard(d.headline, true, afterPath);
  const off = measureLayout(d.headline, false);
  const on = measureLayout(d.headline, true);

  console.log(`\n══════ demo ${d.id} — ${d.ruleTag} ══════`);
  console.log(`العنوان: ${d.headline}`);
  console.log(`المصدر: ${d.source}`);
  console.log(`القاعدة: ${d.ruleLabel}`);
  console.log(`السبب: ${d.trigger}`);
  console.log(`\nقبل (fs=${off.fs}):`);
  for (const line of off.lines) console.log(`  ${line}`);
  console.log(`\nبعد (fs=${on.fs}):`);
  for (const line of on.lines) console.log(`  ${line}`);
  console.log(`\nملفات: demo-${d.id}-before.png · demo-${d.id}-after.png`);

  report.push(`## demo ${d.id} — ${d.ruleTag}`);
  report.push('');
  report.push(`**العنوان الكامل:**`);
  report.push(`> ${d.headline}`);
  report.push('');
  report.push(`- **المصدر:** ${d.source}`);
  report.push(`- **القاعدة التي تدخّلت:** ${d.ruleLabel}`);
  report.push(`- **السبب:** ${d.trigger}`);
  report.push('');
  report.push(`**قبل** (fs=${off.fs}, بلا الكسر الدلالي):`);
  report.push('```');
  for (const line of off.lines) report.push(line);
  report.push('```');
  report.push('');
  report.push(`**بعد** (fs=${on.fs}, مع الكسر الدلالي):`);
  report.push('```');
  for (const line of on.lines) report.push(line);
  report.push('```');
  report.push('');
  report.push(`**الملفَان:** \`demo/demo-${d.id}-before.png\` · \`demo/demo-${d.id}-after.png\``);
  report.push('');
  report.push('---');
  report.push('');
}

await writeFile(join(DEMO_DIR, 'README.md'), report.join('\n'), 'utf8');
console.log(`\nتقرير مكتوب: demo/README.md`);
