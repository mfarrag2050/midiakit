// scripts/verify-vertical-fit — mk/535: manara × breaking بعنوانٍ طويلٍ
// (6 أسطر) على 1080×1080 → حروف المصدر يجب أن تقع داخل الهامش الآمن
// (6% من h = 65 بكسل من الحافّة السفلى).
//
// **قبل الإصلاح:** source baseline ≈ h − 15 → حروف المصدر مقصوصة.
// **بعد الإصلاح:** الكتلةُ تُرفَع (clampHeadlineAnchorToSafeArea) حتى
// يبقى صندوقُ المصدر داخل الهامش.
//
// **حالتان:**
//   (أ) طويل (6 أسطر) ⇒ يجب أن يُرفَع · source bbox أعلى من y=h-65.
//   (ب) قصير (سطر-سطران) ⇒ لا تغيّر · byte-stable للقطات القائمة.
//
// العدمُ: pixel بـ brightness > 100 داخل شريط الهامش السفليّ = اكتشافُ
// حرفٍ خارج الآمن (المصدر مقصوص إلى هناك).

import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { renderVideo } from '@pf-mediakit/renderer';
import { BREAKING } from '@pf-mediakit/templates';
import { resolveBrand } from '@pf-mediakit/engine';
import { Canvas, loadImage } from 'skia-canvas';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = mkdtempSync(join(tmpdir(), 'verify-vertical-fit-'));

const LONG_HEADLINE = '#عاجل| الذهب يرتفع ٠.٥ بالمئة إلى ٤١٧٥ دولارا للأونصة مع تراجع توقعات رفع الفيدرالي الأمريكي الفائدة رغم قوة الدولار';
const SHORT_HEADLINE = 'الذهب يرتفع إلى ٤١٧٥ دولاراً للأونصة';
const SOURCE_TEXT = 'رصد الإخبارية';

const brand = resolveBrand(JSON.parse(readFileSync(join(ROOT, 'brands/manara-agency.json'), 'utf8')));

const SAFE_MARGIN_RATIO = 0.06; // يطابق getVerticalSafeArea
const BRIGHT_THRESHOLD = 100; // حرفٌ على خلفيّة كحليّة (R+G+B > 300 ⇒ اعتبره حبراً)

async function renderAndExtractFrame(headline, size, label) {
  const mp4 = join(OUT_DIR, `${label}.mp4`);
  await renderVideo({
    template: BREAKING, brand,
    content: { headline, source: SOURCE_TEXT },
    size, outPath: mp4, fps: 30,
  });
  const pngPath = join(OUT_DIR, `${label}.png`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '3.0', '-i', mp4, '-frames:v', '1', pngPath], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  const img = await loadImage(pngPath);
  const canvas = new Canvas(size.w, size.h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx;
}

/**
 * يفحصُ شريطَ الهامش السفليّ (آخر 6% من h) للعثور على بكسلات مضيئة
 * (حرفٌ خارجَ الآمن). يعيد نسبة البكسلات المضيئة.
 */
function brightPixelsInBottomMargin(ctx, size) {
  const marginH = Math.round(size.h * SAFE_MARGIN_RATIO);
  const y0 = size.h - marginH;
  const data = ctx.getImageData(0, y0, size.w, marginH).data;
  let bright = 0;
  const total = size.w * marginH;
  for (let i = 0; i < data.length; i += 4) {
    const sum = data[i] + data[i + 1] + data[i + 2];
    if (sum > BRIGHT_THRESHOLD * 3) bright++;
  }
  return { bright, total, ratio: bright / total };
}

/**
 * يفحصُ أنّ المصدرَ ما زال مرئيّاً (ليس كلّه مُقصوصاً خارج الإطار).
 * نقيسُ بكسلات مضيئة في شريطٍ أوسع فوق الهامش السفليّ (من y=0.80 إلى y=h-margin).
 */
function brightPixelsAboveMargin(ctx, size) {
  const marginH = Math.round(size.h * SAFE_MARGIN_RATIO);
  const y0 = Math.round(size.h * 0.80);
  const h = size.h - marginH - y0;
  if (h <= 0) return { bright: 0, total: 1, ratio: 0 };
  const data = ctx.getImageData(0, y0, Math.round(size.w * 0.4), h).data;
  let bright = 0;
  const total = Math.round(size.w * 0.4) * h;
  for (let i = 0; i < data.length; i += 4) {
    const sum = data[i] + data[i + 1] + data[i + 2];
    if (sum > BRIGHT_THRESHOLD * 3) bright++;
  }
  return { bright, total, ratio: bright / total };
}

const cases = [
  { label: 'sq-long', size: { w: 1080, h: 1080 }, headline: LONG_HEADLINE, kind: 'long' },
  { label: 'sq-short', size: { w: 1080, h: 1080 }, headline: SHORT_HEADLINE, kind: 'short' },
  { label: 'por-long', size: { w: 1080, h: 1350 }, headline: LONG_HEADLINE, kind: 'long' },
];

console.log('▶ verify-vertical-fit · manara × breaking · الكتلةُ ضمن الهامش الآمن');
console.log(`  هامش سفليّ = ${(SAFE_MARGIN_RATIO * 100).toFixed(0)}% من h · عتبة الحبر: R+G+B > ${BRIGHT_THRESHOLD * 3}`);
console.log();

const failures = [];
for (const c of cases) {
  const ctx = await renderAndExtractFrame(c.headline, c.size, c.label);
  const bottom = brightPixelsInBottomMargin(ctx, c.size);
  const above = brightPixelsAboveMargin(ctx, c.size);
  // قاعدة الفحص:
  //  • شريطُ الهامش السفليّ: بكسلات مضيئة ≤ 0.1% (لا حرف يخترقه).
  //  • الحالة الطويلة فقط: نتوقّع المصدر في شريط ما فوق الهامش (y=0.80..
  //    h-margin) > 0.1% ⇒ تأكّدنا أنّ clamp رفع الكتلة إلى هناك.
  //  • الحالة القصيرة: المصدر يقع أعلى بكثير (y≈0.72) — يكفي أن لا شيء
  //    مقصوصاً في الهامش السفليّ.
  const bottomPass = bottom.ratio < 0.001;
  const abovePass = c.kind === 'long' ? above.ratio > 0.001 : true;
  const pass = bottomPass && abovePass;
  const mark = pass ? '✓' : '✗';
  console.log(`  ${mark} ${c.label.padEnd(10)} ${c.size.w}×${c.size.h} · هامش=${(bottom.ratio * 100).toFixed(3)}% · فوق=${(above.ratio * 100).toFixed(3)}%`);
  if (!pass) failures.push({ ...c, bottom, above, reason: !bottomPass ? 'bottom-overflow' : 'source-missing' });
}

try { rmSync(OUT_DIR, { recursive: true }); } catch {}

if (failures.length > 0) {
  console.error(`\n✗ verify-vertical-fit FAILED — ${failures.length} حالة`);
  for (const f of failures) {
    console.error(`  ${f.label} · ${f.reason} · هامش=${(f.bottom.ratio * 100).toFixed(3)}% · فوق=${(f.above.ratio * 100).toFixed(3)}%`);
  }
  process.exit(1);
}
console.log('\n✓ verify-vertical-fit PASSED — الكتلةُ ضمن الهامش في كلّ الحالات.');
process.exit(0);
