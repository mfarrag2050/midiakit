// 320 §٢ · جدول كلّ حقل BrandKit: له مستهلك في مسار الرسم أم لا؟
//
// المنهج:
//   1. استخرج كلّ path حقل من brand-kit.ts (dot-notation: colors.text · إلخ)
//   2. لكلّ حقل: grep على packages/engine (مسار الرسم) لأيّ ذكر:
//      - `brand.<path>` أو `.<path>` أو `theme.<path>` أو resolve('<path>')
//   3. صنّف: consumed / unconsumed
//
// **قيد:** المستهلك يحتاج إمّا قراءة مباشرة (`brand.colors.text`) أو مرجعاً
// (`'colors.text'` كسلسلة تُحلّ عبر resolveRef). النموذج الحاليّ يفحص كليهما.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// كامل مسار الرسم/التخطيط · liste النطاقات (engine كامل + templates + renderer)
const SCAN_PATHS = [
  join(ROOT, 'packages/engine/src'),
  join(ROOT, 'packages/templates/src'),
  join(ROOT, 'apps/renderer/src'),
];

// قائمة الحقول (يدويّاً · مأخوذة من brand-kit.ts + المرجعيّات في default-brand.ts)
// لا نحاول توليد ديناميكيّاً — الوضوح أهمّ من الأتمتة هنا.
const FIELDS = [
  // ── جذر ──
  { path: 'id',        note: 'معرّف الهويّة' },
  { path: 'name',      note: 'اسم العرض' },
  { path: 'version',   note: 'إصدار المخطّط' },
  { path: 'direction', note: 'rtl/ltr — يُقرأ في resolveBrand · تُستعمل داخل drawLineRTL' },
  { path: 'locale',    note: 'ar/en — يُقرأ في applyLocaleToBrand' },

  // ── fonts ──
  { path: 'fonts.primary.family',      note: 'اسم عائلة الخطّ في ctx.font' },
  { path: 'fonts.primary.weights',     note: 'أوزان light/regular/bold' },
  { path: 'fonts.primary.source',      note: 'builtin/custom' },
  { path: 'fonts.primary.licenseAck',  note: 'إقرار الترخيص' },
  { path: 'fonts.primary.weights.regular.metrics', note: 'ascent/descent/unitsPerEm (BASELINE-A · L-73)' },
  { path: 'fonts.fallback',            note: 'sans-serif' },
  { path: 'fonts.capabilities.kashida', note: 'FontCaps' },
  { path: 'fonts.capabilities.kashidaMethod', note: 'tatweel/variableAxis' },
  { path: 'fonts.capabilities.variableAxes', note: 'محاور الخطّ المتغيّر' },
  { path: 'fonts.capabilities.diacriticsSafe', note: 'أمان التشكيل' },
  { path: 'fonts.byLocale.ar',         note: 'خطّ عربيّ بديل' },
  { path: 'fonts.byLocale.latin',      note: 'خطّ لاتينيّ بديل' },

  // ── colors ──
  { path: 'colors.text',          note: 'نصّ العنوان' },
  { path: 'colors.accent',        note: 'تمييز' },
  { path: 'colors.urgentBadge',   note: 'خلفيّة بادج عاجل' },
  { path: 'colors.urgentBg',      note: 'خلفيّة قالب breaking (fallback image · اسم مضلّل · L)' },
  { path: 'colors.urgentBgTint',  note: 'variant للـwatermark' },
  { path: 'colors.locationBadge', note: 'خلفيّة بادج موقع' },
  { path: 'colors.surface',       note: 'خلفيّة أساسيّة' },
  { path: 'colors.placeholder',   note: 'خلفيّة gradient · fallback' },

  // ── logo + watermark ──
  { path: 'logo.url',             note: 'رابط الشعار' },
  { path: 'logo.assetId',         note: 'معرّف الأصل (مرفوع)' },
  { path: 'logo.size',            note: 'حجم الشعار' },
  { path: 'logo.margin',          note: 'هامش' },
  { path: 'logo.position',        note: 'موضع (bottom-left · إلخ)' },
  { path: 'logo.watermark.enabled', note: 'تفعيل العلامة المائيّة' },
  { path: 'logo.watermark.scale',   note: 'تكبير' },
  { path: 'logo.watermark.offsetX', note: 'إزاحة أفقيّة' },
  { path: 'logo.watermark.opacity', note: 'شفافيّة' },
  { path: 'logo.watermark.tint',    note: 'لون التلوين (colors.urgentBgTint reference)' },

  // ── typography ──
  { path: 'typography.headline.max',  note: 'حجم أقصى للعنوان' },
  { path: 'typography.headline.min',  note: 'حجم أدنى' },
  { path: 'typography.headline.lineHeight', note: 'ارتفاع السطر' },
  { path: 'typography.headline.boxWidth',   note: 'عرض الصندوق' },
  { path: 'typography.breaking.max',        note: 'قالب breaking حصراً' },
  { path: 'typography.breaking.headlineFsRatio', note: 'نطاق نسبة fs من عرض القماش' },
  { path: 'typography.breaking.boxWidthRange',   note: 'نطاق نسبة boxW' },
  { path: 'typography.breaking.wrapMode',        note: 'uniform/alternating' },
  { path: 'typography.breaking.readableMinRatio', note: 'أدنى نسبة للقراءة' },
  { path: 'typography.breaking.targetFill',      note: 'ملء مستهدف' },
  { path: 'typography.kicker.max',              note: 'حجم الكيكر' },
  { path: 'typography.title3l.max',             note: 'عناوين 3 أسطر' },
  { path: 'typography.source.size',             note: 'حجم سطر المصدر' },
  { path: 'typography.source.weight',           note: 'وزن سطر المصدر' },
  { path: 'typography.reelTitle.max',           note: 'قوالب reel' },
  { path: 'typography.accentBar.height',        note: 'شريط التمييز' },
  { path: 'typography.lineHeightMode',          note: 'fixed/dynamic' },
  { path: 'typography.justify.mode',            note: 'kashida/space' },
  { path: 'typography.justify.maxStretchPerSite', note: 'أقصى مطّ لموقع' },
  { path: 'typography.justify.maxSitesPerWord',   note: 'مواقع لكلمة' },
  { path: 'typography.justify.minLineFill',       note: 'ملء أدنى للسطر' },
  { path: 'typography.justify.lastLine',          note: 'sطر أخير: natural/full' },
  { path: 'typography.semanticBreaks.enabled',    note: 'الكسر الدلاليّ' },
  { path: 'typography.semanticBreaks.useModel',   note: 'LLM (مؤجَّل)' },
  { path: 'typography.diacritics.enabled',        note: 'تفعيل التشكيل الآليّ' },
  { path: 'typography.diacritics.mode',           note: 'full/partial' },
  { path: 'typography.bidi.enabled',              note: 'تفعيل ثنائيّ الاتّجاه' },
  { path: 'typography.bidi.numerals',             note: 'arabic/latin — MAPPED في preprocessBidi' },
  { path: 'typography.caption.max',               note: 'ترجمة/كابشن' },

  // ── badges ──
  { path: 'badges.urgent.label',    note: 'نصّ «عاجل»' },
  { path: 'badges.urgent.fontSize', note: 'حجم' },
  { path: 'badges.urgent.height',   note: 'ارتفاع' },
  { path: 'badges.urgent.fill',     note: 'لون خلفيّة (colors reference)' },
  { path: 'badges.urgent.textColor', note: 'لون نصّ' },
  { path: 'badges.location.margin',  note: 'هامش موقع' },
  { path: 'badges.location.anchor',  note: 'أنكور' },

  // ── gradient ──
  { path: 'gradient.defaultOpacity', note: 'شفافيّة تدرّج الخلفيّة' },
  { path: 'gradient.defaultReach',   note: 'مدى' },
  { path: 'gradient.shape',          note: 'شكل التدرّج' },
  { path: 'gradient.band',           note: 'شريط' },

  // ── shadows ──
  { path: 'shadows.reelTitle',       note: 'ظلال قوالب reel' },

  // ── margins ──
  { path: 'margins.contentRight',    note: 'حافة يمنى · rightX' },
  { path: 'margins.breakingBaseline', note: 'baseline للعنوان' },
  { path: 'margins.sourceBaseline',  note: 'baseline لسطر المصدر' },
  { path: 'margins.badgeGap',        note: 'فجوة بادج' },
  { path: 'margins.cardTopPortrait', note: 'أعلى بطاقة portrait' },
  { path: 'margins.cardBottomS01',   note: 'أسفل بطاقة' },

  // ── motion ──
  { path: 'motion.segmentMin',       note: 'مدّة أدنى لمقطع فيديو' },
  { path: 'motion.segmentMax',       note: 'أعلى' },
  { path: 'motion.crossfade',        note: 'انتقال' },
  { path: 'motion.reelCrossfade',    note: 'reel' },
  { path: 'motion.titleFadeIn',      note: 'دخول عنوان' },
  { path: 'motion.titleFadeOut',     note: 'خروج' },
  { path: 'motion.badgeDelay',       note: 'تأخير بادج' },
  { path: 'motion.badgeFade',        note: 'ظهور بادج' },
  { path: 'motion.lineStagger',      note: 'تأخير سطر' },
  { path: 'motion.lineFade',         note: 'ظهور سطر' },
  { path: 'motion.outro',            note: 'خروج' },
  { path: 'motion.badgePulse',       note: 'نبض بادج' },

  // ── outputs · audio · placement · attribution ──
  { path: 'outputs.x',               note: 'أبعاد x (1080²)' },
  { path: 'outputs.feed',            note: 'feed (1080×1350)' },
  { path: 'outputs.reel',            note: 'reel (1080×1920)' },
  { path: 'audio',                   note: 'قائمة أصوات (فيديو)' },
  { path: 'placement.logo',          note: 'موضع الشعار' },
  { path: 'placement.badge',         note: 'موضع البادج' },
  { path: 'placement.source',        note: 'موضع المصدر' },
  { path: 'placement.caption',       note: 'موضع الكابشن' },
  { path: 'attribution.logoMode',    note: 'none/generic/official' },
  { path: 'attribution.platformNameStyle', note: 'ar/en' },
  { path: 'attribution.separator',   note: 'فاصل' },
  { path: 'attribution.iconSize',    note: 'حجم أيقونة' },
];

function hasConsumer(pathStr) {
  // ثلاثة أنماط استهلاك في engine:
  //   (١) `brand.<path>` أو `args.brand.<path>` أو `theme.<path>` أو `.brand.<path>`
  //   (٢) `'<path>'` كـstring literal (resolveRef يقرأ الـpath)
  //   (٣) آخر segment كـproperty access بعد destructure (`typography.bidi`)
  const escaped = pathStr.replace(/\./g, '\\.');
  const lastSegment = pathStr.split('.').pop();
  const lastTwo = pathStr.split('.').slice(-2).join('.').replace(/\./g, '\\.');
  const patterns = [
    // (١) full path من brand أو theme أو args
    `\\.${escaped}\\b`,
    // (٢) string literal (resolveRef · resolve('colors.text'))
    `'${escaped}'`,
    `"${escaped}"`,
    // (٣) آخر جزءَين متتاليَين (يمسك destructured references)
    `\\.${lastTwo}\\b`,
  ];
  for (const p of patterns) {
    for (const scan of SCAN_PATHS) {
      try {
        const out = execSync(
          `grep -rlE "${p}" ${scan} --include="*.ts" --include="*.json" 2>/dev/null | grep -v test | head -1`,
          { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }
        ).trim();
        if (out) return true;
      } catch { /* no match */ }
    }
  }
  return false;
}

const consumed = [];
const unconsumed = [];
for (const f of FIELDS) {
  if (hasConsumer(f.path)) consumed.push(f);
  else unconsumed.push(f);
}

console.log('═══ جدول 320 §٢ · مستهلكات BrandKit في packages/engine (مسار الرسم) ═══');
console.log('');
console.log(`مُستهلَك: ${consumed.length} حقلاً`);
console.log(`غير مستهلَك: ${unconsumed.length} حقلاً`);
console.log('');
console.log('══ غير مستهلَك (علامات في العقد بلا أثر) ══');
for (const f of unconsumed) {
  console.log(`  ✗ ${f.path.padEnd(45)} — ${f.note}`);
}
console.log('');
console.log('══ مُستهلَك ══');
for (const f of consumed) {
  console.log(`  ✓ ${f.path}`);
}
