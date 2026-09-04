// diagnose-clip — يقيس أعلى بكسل ملوّن في مناطق النصّ داخل مخرجات
// موجودة، ويقارنه بحافة الصندوق. الهدف: تحديد ما إن كان القصّ عيباً
// في demo/multilang-demo.png وحدها أم في snapshots/ (كلها عربية).

import { Canvas, Image } from 'skia-canvas';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function loadImg(path) {
  const img = new Image();
  const buf = await readFile(path);
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = (e) => rej(e);
    img.src = buf;
  });
  return img;
}

/** يعيد صف أعلى بكسل يختلف عن لون الخلفية داخل rect.
 * الخلفية تُقاس من زاوية أول صف داخل rect (يُفترض أنها فارغة). */
function topmostColoredRow(img, rect) {
  const c = new Canvas(img.width, img.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(rect.x, rect.y, rect.w, rect.h);
  // نستنبط خلفية من مركز أول صف (لتفادي حدود الصندوق)
  const midX = Math.floor(rect.w / 2);
  const bgIdx = (0 * rect.w + midX) * 4;
  const bgR = data.data[bgIdx], bgG = data.data[bgIdx + 1], bgB = data.data[bgIdx + 2];
  const tolerance = 25;
  for (let row = 0; row < rect.h; row++) {
    for (let col = 4; col < rect.w - 4; col++) {  // نتخطّى الإطارات
      const idx = (row * rect.w + col) * 4;
      const r = data.data[idx], g = data.data[idx + 1], b = data.data[idx + 2];
      const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (diff > tolerance) return row;
    }
  }
  return -1;
}

console.log('════ 1) demo/multilang-demo.png — الكروت الثلاثة ════');
{
  const path = join(ROOT, 'demo/multilang-demo.png');
  if (existsSync(path)) {
    const img = await loadImg(path);
    // الشبكة: 3 كروت 540×700 بفاصل 30، مع PAD=30 أفقياً + 80+30=110 عمودياً
    const CARD_W = 540, CARD_H = 700, GAP = 30, PAD = 30;
    const cardY = PAD + 80;
    const cards = [
      { label: 'ar', bx: PAD + 0 * (CARD_W + GAP) },
      { label: 'en', bx: PAD + 1 * (CARD_W + GAP) },
      { label: 'tr', bx: PAD + 2 * (CARD_W + GAP) },
    ];
    // خلفية العربي: brand.colors.surface = '#0B0B0B' من DEFAULT_BRAND (نفحص)
    // (لكن كل الكروت تشترك surface — نستعمل الرمادي الغامق تقريباً)
    // نتخطّى 3 بكسل من الإطار
    const border = 3;
    for (const card of cards) {
      const rect = { x: card.bx + border, y: cardY + border, w: CARD_W - 2 * border, h: CARD_H - 2 * border };
      const topRow = topmostColoredRow(img, rect);
      console.log(`  ${card.label}  card at (${card.bx}, ${cardY})  → أعلى بكسل نصّ (بعد تخطّي إطار ${border}px) عند row=${topRow + border} من قمة الصندوق`);
    }
  } else {
    console.log('  (demo/multilang-demo.png غير موجودة)');
  }
}

console.log('\n════ 2) snapshots/ العربية — هل النصّ مقصوص؟ ════');
{
  // نُركّز على snapshots/preview-default.png (breaking template · default brand)
  // خلفية breaking = urgentBg = '#B31E1E' (أحمر)
  const path = join(ROOT, 'snapshots/preview-default.png');
  if (existsSync(path)) {
    const img = await loadImg(path);
    console.log(`  الملف: ${img.width}×${img.height}`);
    // لا نعرف مربّع النصّ بالضبط بلا قراءة القالب — نبحث في المنطقة الوسطى
    // (breaking template يضع headline في وسط القماش)
    // نُقسّم القماش عمودياً إلى شرائح ونبحث عن أول شريحة تحوي بكسلات
    // مختلفة عن أحمر urgentBg.
    // فحص الشريط الأوسط (headline المتوقّع)
    const midBand = { x: 100, y: Math.floor(img.height * 0.35), w: img.width - 200, h: Math.floor(img.height * 0.35) };
    const midTop = topmostColoredRow(img, midBand);
    console.log(`  في الشريط الأوسط (headline المتوقّع): أعلى بكسل ملوّن على بعد ${midTop}px من قمة الشريط`);
    console.log(`  عرض الشريط: 200-${img.width - 200}, ارتفاعه: ${midBand.y}-${midBand.y + midBand.h}`);
  } else {
    console.log('  (snapshots/preview-default.png غير موجودة)');
  }
}

console.log('\n════ 3) طرح: هل قصّ demo مختلف عن snapshots؟ ════');
console.log('  demo: نستخدم y=140 ثابتاً · نرسم مباشرة عبر fillText.');
console.log('  snapshots: تُنتَج عبر renderFrame → المحرك يستخدم منطقاً معقّداً.');
console.log('  الاختلاف قد يكون:');
console.log('    (أ) demo script نفسه مذنب — y ثابتة بلا تعويض للصاعد.');
console.log('    (ب) أو المحرك ذاته يقصّ عربياً — لكن snapshots تمرّ لأن العنوان');
console.log('        فيها من محارف بلا هذيّات مرتفعة (لا همزات، لا مدّات).');
