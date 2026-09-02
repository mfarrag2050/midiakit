// layers/attribution — إسناد المصدر عند إعادة النشر من منصات أخرى.
//
// المرجع: docs/12 §3 (الطور 3.8، بند 1) + docs/04 الطبقات + ATTRIBUTIONS.md
//          §شعارات المنصات (فحص الرخص).
//
// المبدأ القانوني (راجع ATTRIBUTIONS.md):
//   • النصّ (اسم المنصة + المقبض): مسموح تحت nominative fair use لكل المنصات.
//   • الشعار الرسمي (logoMode='official'): يُرسم من مسار SVG في `simple-icons`
//     (رخصة CC0 على الرسم — العلامة التجارية نفسها تبقى للمنصة).
//     المحرك يرفض الرسم بلا `licenseAck=true` من العميل في `brand.attribution.logoAcks[platform]`.
//   • الأيقونة العامة (logoMode='generic'): شكل هندسي محايد نصمّمه هنا،
//     بلا علامة تجارية أصلاً — صفر مخاطرة.
//   • النمط الافتراضي (logoMode='none'): نصّ فقط بلا أيقونة — الأنظف.
//
// **قاعدة الطُهر:** لا ملف صورة/شعار مشحون في `packages/*`. الطبقة
// تستهلك `PLATFORM_PATH_STRINGS` (مسارات public-domain مقتبسة من
// simple-icons) وتترك بناء Path2D للمستدعي (env-specific).

import type { BrandKit, PlatformKey, PlatformLogoMode } from '@pf-mediakit/shared';
import type { CanvasDrawContext, Path2DLike } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';
import { mapNumerals } from '../text/bidi.js';

// ── أسماء المنصات بالنمطين ─────────────────────────────

const PLATFORM_NAMES_AR: Record<PlatformKey, string> = {
  tiktok: 'تيك توك',
  x: 'إكس',
  instagram: 'إنستغرام',
  youtube: 'يوتيوب',
  telegram: 'تيليجرام',
  facebook: 'فيسبوك',
};

const PLATFORM_NAMES_LATIN: Record<PlatformKey, string> = {
  tiktok: 'TikTok',
  x: 'X',
  instagram: 'Instagram',
  youtube: 'YouTube',
  telegram: 'Telegram',
  facebook: 'Facebook',
};

// ── مسارات simple-icons — CC0 (راجع ATTRIBUTIONS.md §5) ─
//
// **مهم:** هذه المسارات هي *الرسم* فقط (public domain). العلامة التجارية
// نفسها تبقى ملك المنصة. الاستعمال يشترط `brand.attribution.logoAcks[platform].licenseAck=true`.
//
// المصدر: `simple-icons` npm (viewBox 24×24). كل مسار مقتبس حرفياً من
// ملف SVG المطابق. لا نضيف اللون الرسمي للعلامة (siX.hex) — نرسم بلون
// brandKit فقط.

export const PLATFORM_PATH_STRINGS: Record<PlatformKey, string> = {
  tiktok:
    'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
  x:
    'M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z',
  instagram:
    'M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077',
  youtube:
    'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  telegram:
    'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z',
  facebook:
    'M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z',
};

/** viewBox الأصلي لكل مسار simple-icons — دائماً 24×24. */
export const PLATFORM_ICON_VIEWBOX = 24;

// ── معلمات الطبقة ──────────────────────────────────────

export type AttributionMode = 'handle' | 'name' | 'both';

export type AttributionAnchor =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | { readonly x: number; readonly y: number };

export interface AttributionParams {
  readonly platform: PlatformKey;
  readonly mode: AttributionMode;
  /** المقبض (`@username`) — يُطلب في mode='handle' أو 'both'. */
  readonly handle?: string;
  /** الاسم الظاهر — يُطلب في mode='name' أو 'both'. */
  readonly name?: string;
  readonly anchor: AttributionAnchor;
  /**
   * يتجاوز `brand.attribution.logoMode`. مفيد للقالب الذي يريد إجباراً
   * (مثلاً reel يفضّل 'generic' حتى لو الهوية 'none').
   */
  readonly logoModeOverride?: PlatformLogoMode;
  /**
   * Path2D مبنيّ من `PLATFORM_PATH_STRINGS[platform]` بواسطة المستدعي.
   * مطلوب حين المسار الفعلي = 'official'. غيابه يُسبّب تراجعاً إلى 'generic'.
   */
  readonly officialPath?: Path2DLike;
  /**
   * بادئة نصّية (مثلاً «المصدر:»). الافتراضي: بلا بادئة — يترك للقالب.
   */
  readonly prefixLabel?: string;
  /** هامش من الحواف عند anchor اسمي (top-left…). افتراضي 40px. */
  readonly margin?: number;
}

// ── بناء النصّ ─────────────────────────────────────────

/**
 * يعزل مقطعاً لاتينياً داخل سياق عربي بحيث يبقى ترتيبه صحيحاً بصرياً
 * حتى مع حروف محايدة (مثل `@` قبل الاسم). نستعمل LRI (U+2066) +
 * PDI (U+2069) بدل LRM لأن LRM يعالج حرفاً واحداً فقط؛ LRI/PDI يعزل
 * كامل المقطع من تأثير اتجاه الجملة.
 *
 * الأثر البصري: بلا هذه العزلة، `@ahmadalshaer` داخل عربي يُعرض بصرياً
 * كـ`ahmadalshaer@` لأن `@` محايد Bidi يُلحق بالجملة العربية.
 */
const LRI = '⁦';
const PDI = '⁩';
const isolateLtr = (s: string): string => `${LRI}${s}${PDI}`;

function buildAttributionText(
  brand: BrandKit,
  params: AttributionParams
): string {
  const style = brand.attribution.platformNameStyle;
  const sep = brand.attribution.separator;
  const platformName =
    style === 'ar'
      ? PLATFORM_NAMES_AR[params.platform]
      : PLATFORM_NAMES_LATIN[params.platform];

  // العزل مطلوب فقط للسياق العربي (base RTL). في LTR الترتيب طبيعي.
  const wrapHandle = (h: string): string =>
    brand.direction === 'rtl' ? isolateLtr(h) : h;

  let body: string;
  switch (params.mode) {
    case 'handle': {
      const h = params.handle ? wrapHandle(params.handle) : '';
      body = `${platformName}${sep}${h}`;
      break;
    }
    case 'name': {
      // «أحمد الشاعر على تيك توك» / "Ahmed on TikTok" — أدبيّ أكثر من الفاصل.
      const n = params.name ?? '';
      const connector = style === 'ar' ? ' على ' : ' on ';
      body = `${n}${connector}${platformName}`;
      break;
    }
    case 'both': {
      const n = params.name ?? '';
      const h = params.handle ? wrapHandle(params.handle) : '';
      body = `${platformName}${sep}${n}${sep}${h}`;
      break;
    }
  }

  return params.prefixLabel ? `${params.prefixLabel} ${body}` : body;
}

// ── حسم mode الفعلي (بعد الأمان القانوني) ───────────────

/**
 * يُعيد النمط الفعلي بعد فحص الأمان القانوني والتوفّر التقني:
 *   • official تحتاج `licenseAck=true` **و** `officialPath` مُمرَّراً.
 *     غياب أيّهما ⇒ تراجع إلى 'generic'.
 *   • generic متاح دائماً (مرسوم من ctx primitives).
 *   • none = لا شيء.
 */
function resolveEffectiveLogoMode(
  brand: BrandKit,
  params: AttributionParams
): PlatformLogoMode {
  const requested = params.logoModeOverride ?? brand.attribution.logoMode;

  if (requested === 'official') {
    const ack = brand.attribution.logoAcks[params.platform];
    if (!ack.licenseAck) return 'generic'; // تراجع صامت — الخطأ يُرفع خارج الرسم إن أردنا
    if (!params.officialPath) return 'generic';
    return 'official';
  }
  return requested;
}

// ── رسم الأيقونة ───────────────────────────────────────

/**
 * يرسم شعار simple-icons عبر Path2D. اللون = brand.colors.text.
 * scale = iconSize / 24 (viewBox الأصلي).
 */
function drawOfficialLogo(
  ctx: CanvasDrawContext,
  x: number,
  y: number,
  iconSize: number,
  color: string,
  path: Path2DLike
): void {
  ctx.save();
  ctx.translate(x, y);
  const s = iconSize / PLATFORM_ICON_VIEWBOX;
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
}

/**
 * يرسم أيقونة عامة محايدة: دائرة مملوءة + رمز داخلي بسيط
 * (⏵ لـ tiktok/youtube، @ لـ x/instagram/facebook/telegram).
 * لا علامة تجارية أصلاً. اللون = brand.colors.text.
 */
function drawGenericIcon(
  ctx: CanvasDrawContext,
  x: number,
  y: number,
  iconSize: number,
  brand: BrandKit,
  platform: PlatformKey
): void {
  const cx = x + iconSize / 2;
  const cy = y + iconSize / 2;
  const r = iconSize / 2;

  // دائرة خارجية (خلفية بلون العلامة الصريحة للجدار الخلفي)
  ctx.save();
  ctx.fillStyle = brand.colors.text;
  ctx.beginPath();
  // لا arc في CanvasDrawContext — نبنيها بأربعة أرباع arcTo.
  // بدلاً منها: مستطيل مدوّر بدرجة قصوى = دائرة عمليّاً.
  const rr = r; // radius = half of iconSize
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, iconSize, iconSize, rr);
  } else {
    // بناء يدوي (نفس أسلوب badge)
    ctx.moveTo(cx, y);
    ctx.arcTo(x + iconSize, y, x + iconSize, y + iconSize, rr);
    ctx.arcTo(x + iconSize, y + iconSize, x, y + iconSize, rr);
    ctx.arcTo(x, y + iconSize, x, y, rr);
    ctx.arcTo(x, y, x + iconSize, y, rr);
    ctx.closePath();
  }
  ctx.fill();

  // رمز داخلي بلون خلفية السطح (`surface`) — يظهر بارزاً من الدائرة
  ctx.fillStyle = brand.colors.surface;
  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
  const glyphSize = Math.round(iconSize * 0.55);
  ctx.font = `700 ${glyphSize}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.direction = 'ltr';

  const isVideo =
    platform === 'tiktok' || platform === 'youtube';
  const glyph = isVideo ? '▶' : '@';
  ctx.fillText(glyph, cx, cy);
  ctx.restore();
}

// ── حساب الموضع (anchor → x/y) ────────────────────────

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

function anchorRect(
  anchor: AttributionAnchor,
  size: CanvasSize,
  totalW: number,
  h: number,
  margin: number
): Rect {
  if (typeof anchor !== 'string') {
    return { x: anchor.x, y: anchor.y, w: totalW, h };
  }
  const rightX = size.w - margin - totalW;
  const leftX = margin;
  const topY = margin;
  const bottomY = size.h - margin - h;
  switch (anchor) {
    case 'top-left':
      return { x: leftX, y: topY, w: totalW, h };
    case 'top-right':
      return { x: rightX, y: topY, w: totalW, h };
    case 'bottom-left':
      return { x: leftX, y: bottomY, w: totalW, h };
    case 'bottom-right':
      return { x: rightX, y: bottomY, w: totalW, h };
  }
}

// ── الدالة الرئيسية ────────────────────────────────────

export function drawAttribution(
  ctx: CanvasDrawContext,
  size: CanvasSize,
  brand: BrandKit,
  params: AttributionParams
): void {
  const effectiveMode = resolveEffectiveLogoMode(brand, params);
  const iconSize = brand.attribution.iconSize;

  // نصّ الإسناد. لا preprocessBidi هنا: نستدعي ctx.fillText مرّة واحدة
  // على السطر الكامل، فـCanvas يطبّق Unicode Bidi تلقائياً — المقبض
  // اللاتيني `@user` يبقى بترتيبه الصحيح داخل السياق العربي بدون
  // تدخّل. تأكيد الاختيار: طبقة source (render.ts:822) وkicker
  // (render.ts:316) تفعلان المثل. preprocessBidi يُستعمل فقط في
  // prepareHeadline لأنه يغذّي parseTokens (رسم كلمة كلمة).
  // نطبّق mapNumerals فقط (تحويل 123 ↔ ١٢٣ إن طلبت الهوية).
  const rawText = buildAttributionText(brand, params);
  const bidiText = mapNumerals(rawText, brand.typography.bidi.numerals);

  // قياس النص (نستعمل brand.typography.source للحجم + وزن).
  const src = brand.typography.source;
  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;
  ctx.font = `${src.weight} ${src.size}px ${family}`;
  const textW = ctx.measureText(bidiText).width;

  // العرض الكلّي = أيقونة (إن وُجدت) + فراغ + نصّ.
  const showIcon = effectiveMode !== 'none';
  const gap = showIcon ? Math.round(iconSize * 0.3) : 0;
  const totalW = (showIcon ? iconSize + gap : 0) + textW;
  const totalH = Math.max(iconSize, src.size);

  const margin = params.margin ?? 40;
  const rect = anchorRect(params.anchor, size, totalW, totalH, margin);

  // ترتيب العناصر بحسب اتجاه الهوية:
  //   • RTL: الأيقونة على اليمين، النصّ يمتدّ إلى اليسار.
  //   • LTR: الأيقونة على اليسار، النصّ يمتدّ إلى اليمين.
  const isRTL = brand.direction === 'rtl';

  // موضع النصّ (نستعمل textBaseline='middle' للمحاذاة الرأسية مع الأيقونة).
  ctx.fillStyle = brand.colors.text;
  ctx.textBaseline = 'middle';
  ctx.direction = isRTL ? 'rtl' : 'ltr';
  const centerY = rect.y + totalH / 2;

  if (isRTL) {
    // الأيقونة عند الحافة اليمنى للمستطيل.
    if (showIcon) {
      const iconX = rect.x + rect.w - iconSize;
      const iconY = rect.y + (totalH - iconSize) / 2;
      if (effectiveMode === 'official' && params.officialPath) {
        drawOfficialLogo(ctx, iconX, iconY, iconSize, brand.colors.text, params.officialPath);
      } else if (effectiveMode === 'generic') {
        drawGenericIcon(ctx, iconX, iconY, iconSize, brand, params.platform);
      }
    }
    // النصّ محاذى لليمين، ينتهي قبل الأيقونة (أو عند الحافة اليمنى للمستطيل).
    ctx.textAlign = 'right';
    const textRightX = rect.x + rect.w - (showIcon ? iconSize + gap : 0);
    ctx.fillText(bidiText, textRightX, centerY);
  } else {
    // LTR: الأيقونة على اليسار.
    if (showIcon) {
      const iconX = rect.x;
      const iconY = rect.y + (totalH - iconSize) / 2;
      if (effectiveMode === 'official' && params.officialPath) {
        drawOfficialLogo(ctx, iconX, iconY, iconSize, brand.colors.text, params.officialPath);
      } else if (effectiveMode === 'generic') {
        drawGenericIcon(ctx, iconX, iconY, iconSize, brand, params.platform);
      }
    }
    ctx.textAlign = 'left';
    const textLeftX = rect.x + (showIcon ? iconSize + gap : 0);
    ctx.fillText(bidiText, textLeftX, centerY);
  }
}
