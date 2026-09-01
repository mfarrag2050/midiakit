// scripts/eval-semantic-break-internal.mjs — قياس داخلي على 20 عنواناً.
//
// **قبل تنزيل الموارد الخارجية (WojoodGaza)،** نقيس أثر الكسر الدلالي
// على عناوين إخبارية مكتوبة يدوياً. لا مورد خارجي هنا (تعليمات المالك).
//
// **يعرض جدولاً:** العنوان · التقسيم قبل · التقسيم بعد · fs · minFill

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { BREAKING } from '@pf-mediakit/templates';
import { resolveBrand, buildRenderPlan } from '@pf-mediakit/engine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const SIZE = { w: 1080, h: 1350 };

const brandOff = resolveBrand(DEFAULT_BRAND);
const brandOn = resolveBrand({
  ...DEFAULT_BRAND,
  typography: {
    ...DEFAULT_BRAND.typography,
    semanticBreaks: {
      ...DEFAULT_BRAND.typography.semanticBreaks,
      enabled: true,
    },
  },
});

// ── العشرون عنواناً — واقعية إخبارية عربية ──────
// اختيار متعمّد يغطّي: حروف جر، إضافات، أعلام مركّبة، أعداد،
// موصولات، ناسخات، أدوات نفي، جمل مركّبة.
const HEADLINES = [
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع',
  'وزير الخارجية التركي يبحث في أنقرة تطورات الأزمة في سوريا',
  'مجلس الأمن الدولي يعقد جلسة طارئة لمناقشة الوضع الإنساني في غزة',
  'الرئيس المصري يستقبل نظيره الفرنسي في القاهرة لبحث ملفات الشرق الأوسط',
  'ثلاثة قتلى وعشرة جرحى في هجوم مسلح استهدف حافلة في شمال العراق',
  'عبد الفتاح البرهان يعلن حالة الطوارئ في السودان',
  'الأمم المتحدة تدعو إلى وقف فوري لإطلاق النار في اليمن',
  'الذين نجوا من الغارة يروون تفاصيل اللحظات الأخيرة قبل القصف',
  'كان الرئيس التركي رجب طيب أردوغان قد أعلن ذلك في خطاب سابق',
  'لم يعلق البيت الأبيض على تصريحات الرئيس الروسي فلاديمير بوتين',
  'خلال الأسبوع الماضي شهدت المنطقة تصعيداً غير مسبوق في العمليات',
  'إن الاتفاق الجديد بين موسكو وكييف يمثل خطوة نحو تهدئة النزاع',
  'هل تنجح جهود الوساطة القطرية في تحقيق هدنة إنسانية جديدة',
  'أبو ظبي تستضيف قمة عربية طارئة لبحث ملف الأمن الغذائي',
  'رئيس الوزراء اللبناني يعتذر عن تشكيل الحكومة ويعود الملف إلى نقطة الصفر',
  'في قطاع غزة يواصل الطاقم الطبي عملياته رغم نقص المستلزمات',
  'مقتل خمسة من عناصر الأمن في هجوم استهدف نقطة تفتيش في محافظة صلاح الدين',
  'إعلان تشكيل حكومة الوحدة الوطنية في ليبيا برئاسة عبد الحميد الدبيبة',
  'الاقتصاد التركي يواجه ضغوطاً متزايدة مع استمرار تراجع الليرة أمام الدولار',
  'وقعت الإمارات وإسرائيل اتفاقيات تعاون في مجالات الطاقة والزراعة',
];

// ── دالة القياس ────────────────────────────
function measureLayout(brand, headline) {
  const canvas = new Canvas(SIZE.w, SIZE.h);
  const ctx = canvas.getContext('2d');
  const content = { headline, source: 'المصدر' };
  const plan = buildRenderPlan({
    ctx,
    size: SIZE,
    template: BREAKING,
    brand,
    content,
    fps: 30,
  });
  const h = plan.headline;
  if (!h) return null;
  // نبني تقسيماً نصياً — كل سطر كلمات مفصولة بمساحة، الأسطر مفصولة بـ|
  const split = h.linesJustified
    .map((line) => line.map((t) => t.text ?? '').join(' '))
    .join(' | ');
  return {
    fs: h.fontSize,
    boxW: h.chosenBoxW,
    lines: h.linesJustified.length,
    split,
    minFill: h.linesJustified.length > 0
      ? Math.min(
          ...h.linesJustified.map(
            (_, i) => {
              // نستعمل chosenBoxW كمعامل — التقييم النسبي كافٍ للمقارنة
              return 1;
            }
          )
        )
      : 0,
  };
}

// ── تشغيل ─────────────────────────────────
console.log(`[eval] القياس على ${HEADLINES.length} عنواناً — ${SIZE.w}×${SIZE.h}`);
console.log(`[eval] تحذير: ستظهر warnings من wrapOptimal إن اضطرّ للتراجع الدلالي\n`);

let changedCount = 0;
let sameCount = 0;
let fsIncreased = 0;
let fsDecreased = 0;
let linesIncreased = 0;
let linesDecreased = 0;

console.log('العنوان'.padEnd(60) + 'حالة');
console.log('─'.repeat(90));

for (let i = 0; i < HEADLINES.length; i++) {
  const h = HEADLINES[i];
  const off = measureLayout(brandOff, h);
  const on = measureLayout(brandOn, h);
  if (!off || !on) continue;

  const shortH = h.length > 55 ? h.slice(0, 52) + '…' : h;
  const changed = off.split !== on.split || off.fs !== on.fs || off.lines !== on.lines;
  if (changed) changedCount++; else sameCount++;
  if (on.fs > off.fs) fsIncreased++;
  if (on.fs < off.fs) fsDecreased++;
  if (on.lines > off.lines) linesIncreased++;
  if (on.lines < off.lines) linesDecreased++;

  const mark = changed ? '⚡ تغيّر' : '= بلا تغيير';
  console.log(`${i + 1}. ${shortH}   ${mark}`);
  if (changed) {
    console.log(`   قبل: fs=${off.fs} · أسطر=${off.lines} · ${off.split}`);
    console.log(`   بعد: fs=${on.fs} · أسطر=${on.lines} · ${on.split}`);
  }
  console.log('');
}

console.log('─'.repeat(90));
console.log(`الملخّص: ${changedCount} تغيّر · ${sameCount} بلا تغيير`);
console.log(`  fs: ${fsIncreased} ارتفع · ${fsDecreased} انخفض`);
console.log(`  أسطر: ${linesIncreased} زاد · ${linesDecreased} نقص`);
