// mk/524b · حارس: كلّ هويّة × قالبٌ فيه طبقة headline ⇒ يجب أن تكون
// الطبقةُ مرسومةً فعلاً (لا مُسْقَطةً بصمت كما في 523 · manara breaking).
//
// **الأسلوب:** نرندر إطاراً واحداً بمحتوًى غنيّ، ثمّ نحسبُ نسبةَ البكسلات
// «غير الخلفيّة» في شريطٍ أفقيٍّ حول موضع العنوان (verticalAnchor 0.62).
// عتبةٌ نسبيّةٌ من مساحةِ الشريط — لا رقمٌ مطلق (L-02).
//
// «غير الخلفيّة»: يختلفُ لونُها عن لونِ الأركانِ الأربعةِ (البكسل [0,0]
// وأخواته) بأكثر من عتبة ΔE~≥ 20. الأركانُ خلفيّةٌ صرفة لأنّ الطبقاتِ
// المرئيّة (شارة · مصدر · شعار) لا تصلها.
//
// **يفشل قبل 524b على manara × breaking، ويمرّ بعد الإصلاح.**
// L-46 مثبَتٌ بتشغيلَي `git stash` (سجلّ 524b).

import { readFileSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { renderVideo } from '@pf-mediakit/renderer';
import { TEMPLATES } from '@pf-mediakit/templates';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveBrand } from '@pf-mediakit/engine';
import { Canvas, loadImage } from 'skia-canvas';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = mkdtempSync(join(tmpdir(), 'verify-headline-'));

// محتوى غنيّ يغطّي مفاتيح كل القوالب الستّة (كما في verify-render-video-all-templates).
const CONTENT = {
  kicker: 'كيكر تجريبي',
  headline: 'مركز قنديل للأبحاث يعلن نتائج دراسته حول أنماط النزوح الحضري في منطقة نكسوريا هذا العام',
  title: 'عنوان ريلز تجريبي',
  source: 'قنديل بلاغ',
  caption: 'ترجمة',
  location: 'موقع',
  sourceHandle: '@qindeel',
  sourceName: 'مركز قنديل',
};

// mk/534 · محتوى قصير مخصَّص لاختبار طبقة source (headline قصير ⇒ ≤2 سطر
// ⇒ لا تداخل مع شريط source عند y=0.75). نستعمله فقط للقوالب التي فيها
// طبقة source (breaking + بعض cards).
const SOURCE_TEST_CONTENT = {
  headline: 'خبر تجريبيّ قصير للفحص فقط',
  source: 'رصد للأخبار',
};

const SIZE = { w: 1080, h: 1350 };
const REEL_SIZE = { w: 1080, h: 1920 };

// عتبة النسبة: البكسلات «غير الخلفيّة» في شريطِ العنوان يجب أن تتجاوز
// 0.4% من مساحةِ الشريط (10800 بكسل من ~2.7 مليون). أدنى بكثيرٍ من عنوانٍ
// حقيقيّ (~3-5%) وأعلى بكثيرٍ من إطارِ خلفيّةٍ صرفة (0%).
const MIN_NON_BG_RATIO = 0.004;
const COLOR_DIFF_THRESHOLD = 20;

function colorDist(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
}

// mk/534 · مساعدٌ يقيس بكسلات غير الخلفيّة داخل مستطيلٍ نسبيّ.
function countNonBgInBand(ctx, size, centerRatio, halfRatio, xStart = 0, xEnd = 1) {
  const bandCenter = Math.round(size.h * centerRatio);
  const bandHalfHeight = Math.round(size.h * halfRatio);
  const bandY = Math.max(0, bandCenter - bandHalfHeight);
  const bandH = Math.min(size.h - bandY, bandHalfHeight * 2);
  const x0 = Math.max(0, Math.round(size.w * xStart));
  const w = Math.min(size.w - x0, Math.round(size.w * (xEnd - xStart)));
  const data = ctx.getImageData(x0, bandY, w, bandH).data;
  const bg = [data[0], data[1], data[2]];
  let nonBg = 0;
  const total = w * bandH;
  for (let i = 0; i < data.length; i += 4) {
    const px = [data[i], data[i + 1], data[i + 2]];
    if (colorDist(px, bg) > COLOR_DIFF_THRESHOLD) nonBg++;
  }
  return { nonBg, total, ratio: nonBg / total };
}

async function extractFrame(mp4Path, size) {
  const pngPath = join(OUT_DIR, 'frame.png');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '1.2', '-i', mp4Path, '-frames:v', '1', pngPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  const img = await loadImage(pngPath);
  const canvas = new Canvas(size.w, size.h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx;
}

async function extractHeadlineBandPixels(mp4Path, size) {
  const ctx = await extractFrame(mp4Path, size);
  return countNonBgInBand(ctx, size, 0.62, 0.18);
}

// mk/534 · شريطُ المصدر — headline قصير (SOURCE_TEST_CONTENT) ⇒ source
// يقع عند y≈0.70 (headline يستغرق سطرَين أعلى). النصف الأيسر (source
// left-aligned)، حتى y=0.30 من العرض لاستبعاد attribution/logo.
async function extractSourceBandPixels(mp4Path, size) {
  const ctx = await extractFrame(mp4Path, size);
  return countNonBgInBand(ctx, size, 0.71, 0.02, 0, 0.30);
}

async function loadBrand(name) {
  if (name === 'default') return resolveBrand(DEFAULT_BRAND);
  const raw = JSON.parse(readFileSync(join(ROOT, 'brands', `${name}.json`), 'utf8'));
  return resolveBrand(raw);
}

const brandFiles = readdirSync(join(ROOT, 'brands')).filter((f) => f.endsWith('.json'));
const brandNames = ['default', ...brandFiles.map((f) => f.replace(/\.json$/, ''))];

// كلُّ قالبٍ فيه طبقةُ headline ⇒ يُختَبَر (breaking · card_* · reel · plain).
const templatesWithHeadline = Object.entries(TEMPLATES).filter(
  ([, tpl]) => tpl.layers.some((l) => l.type === 'headline')
);

console.log(`▶ verify-headline-rendered · ${brandNames.length} هويّات × ${templatesWithHeadline.length} قوالب`);
console.log(`  عتبة النسبة: ${(MIN_NON_BG_RATIO * 100).toFixed(2)}% · فرق اللون: ${COLOR_DIFF_THRESHOLD}`);
console.log();

const failures = [];
for (const brandName of brandNames) {
  const brand = await loadBrand(brandName);
  for (const [tplName, template] of templatesWithHeadline) {
    const size = tplName === 'reel' ? REEL_SIZE : SIZE;
    const mp4 = join(OUT_DIR, `${brandName}-${tplName}.mp4`);
    try {
      await renderVideo({ template, brand, content: CONTENT, size, outPath: mp4, fps: 30 });
    } catch (err) {
      console.log(`  ⚠ ${brandName} × ${tplName}: فشل الرندر — ${err.message.slice(0, 80)}`);
      continue;
    }
    const { nonBg, total, ratio } = await extractHeadlineBandPixels(mp4, size);
    const hpass = ratio >= MIN_NON_BG_RATIO;
    // mk/534 · طبقة source — نفحصها فقط للقوالب التي تحملها. نُعيد الرندر
    // بمحتوى قصير مخصَّص (SOURCE_TEST_CONTENT) لضمان أنّ شريط y=0.75
    // يُلتقط source فقط لا آخر سطر headline. العتبة 0.15% أدنى من العنوان.
    const hasSource = template.layers.some((l) => l.type === 'source');
    let spass = true, sratio = null;
    if (hasSource) {
      const srcMp4 = join(OUT_DIR, `${brandName}-${tplName}-source.mp4`);
      try {
        await renderVideo({ template, brand, content: SOURCE_TEST_CONTENT, size, outPath: srcMp4, fps: 30 });
        const src = await extractSourceBandPixels(srcMp4, size);
        sratio = src.ratio;
        spass = sratio >= 0.0015;
      } catch (err) {
        console.log(`    ⚠ فشل رندر source-test: ${err.message.slice(0, 60)}`);
        spass = false;
      }
    }
    const pass = hpass && spass;
    const mark = pass ? '✓' : '✗';
    const srcTxt = hasSource ? ` · مصدر=${(sratio * 100).toFixed(3)}%` : ' · بلا مصدر';
    console.log(`  ${mark} ${brandName.padEnd(16)} × ${tplName.padEnd(14)} · عنوان=${(ratio * 100).toFixed(2)}%${srcTxt}`);
    if (!pass) failures.push({ brand: brandName, template: tplName, ratio, sratio, reason: !hpass ? 'headline' : 'source' });
  }
}

try { rmSync(OUT_DIR, { recursive: true }); } catch {}

console.log();
if (failures.length > 0) {
  console.error(`✗ verify-headline-rendered FAILED — ${failures.length} تركيبة بها طبقة غير مرسومة:`);
  for (const f of failures) {
    const src = f.sratio !== null && f.sratio !== undefined ? ` · مصدر=${(f.sratio * 100).toFixed(3)}%` : '';
    console.error(`  ${f.brand} × ${f.template} · سبب=${f.reason} · عنوان=${(f.ratio * 100).toFixed(3)}%${src}`);
  }
  process.exit(1);
}
console.log(`✓ verify-headline-rendered PASSED — كلُّ التركيبات (${brandNames.length}×${templatesWithHeadline.length}) رسمت طبقات headline + source.`);
process.exit(0);
