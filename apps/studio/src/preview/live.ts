// live — استدعاء `renderFrame` من packages/engine على Canvas 2D بمتصفّح
// العميل. **لا تعديل على المحرّك** — يُستورَد ويُستدعى.
//
// **القاعدة الثالثة (CLAUDE.md):** المعاينة تستقبل brand و template و
// content و size، ولا تخترع شيئاً. الأرقام المرسومة تتبع
// `brand.bidi.numerals` **حصراً** — `DigitStyle` تفضيل موظف في اللوحة،
// لا يمسّ المعاينة. الحارس `check:digit-style-isolation` فرع (ب) يفرض
// هذا العزل (كل ملف تحت `apps/studio/src/preview/` يخضع له).
//
// **ADR-006 (تحميل الخط):** أي `measureText` بعد `document.fonts.load()`
// فقط. المعاينة تعرض placeholder «جارٍ تحميل الخط…» أثناء الانتظار.
//
// **مسار SSRF:** `check:no-brand-url-fetch` يحرس هذا الملف — أيّ
// تحميل شبكي لحقل url داخل الهوية = فشل بناء. راجع scripts/check-no-brand-url-fetch.mjs.

import { applyLocaleToBrand, renderFrame, resolveBrand } from '@pf-mediakit/engine';
import type { BrandKit, Locale } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { resolveAssetImages } from './asset-loader';

export interface PreviewInput {
  readonly template: unknown;
  readonly brandConfig: unknown;
  readonly content: Readonly<Record<string, unknown>>;
  readonly size: { readonly w: number; readonly h: number };
  /**
   * IMAGE-VERTICAL: خريطة {fieldName: assetId} — الحقول التي يشير إليها
   * المحتوى بأصل مرفوع. drawPreview يستدعي `assets.get(id)` لكل
   * `assetId`، يحمّل publicUrl إلى HTMLImageElement، ويمرّرها إلى
   * renderFrame كـassets.images[field]. مفتاح field يقابل حرفياً
   * `layer.field` في القالب — runImage يستعمل `layer.field ?? 'image'`.
   */
  readonly assetIds?: Readonly<Record<string, string>>;
}

export interface PreviewResult {
  readonly durationMs: number;
  readonly warning?: string;
}

/** يُدمج config الوارد من mk-api على DEFAULT_BRAND — كل ما يغيب يبقى
 * على الافتراضي المحايد. **لا نخترع قيماً.** */
function mergeBrand(config: unknown): BrandKit {
  const cfg = (config ?? {}) as Partial<BrandKit>;
  // deep merge سطحي — الحقول الأساسية فقط. حقول عميقة (typography.*)
  // تحتاج مزجاً حذراً — نستعمل نمطاً محافظاً: إن أرسل العميل الحقل،
  // نحلّ محلّ الافتراضي كاملاً؛ إن غاب، نُبقي الافتراضي.
  const merged: BrandKit = {
    ...DEFAULT_BRAND,
    ...cfg,
    fonts: {
      ...DEFAULT_BRAND.fonts,
      ...(cfg.fonts ?? {}),
      // IMAGE-VERTICAL: عمّق دمج `primary` — mk-api قد يرسل `{family, source}`
      // بلا `weights`. إن أخذنا ما وصل كاملاً، نفقد الأوزان الافتراضيّة و
      // ensureFontLoaded يفشل. الدمج العميق يحفظ الأوزان الافتراضيّة إن غابت.
      primary: {
        ...DEFAULT_BRAND.fonts.primary,
        ...((cfg.fonts as { primary?: object } | undefined)?.primary ?? {}),
      },
    } as BrandKit['fonts'],
    colors: { ...DEFAULT_BRAND.colors, ...(cfg.colors ?? {}) },
    typography: {
      ...DEFAULT_BRAND.typography,
      ...(cfg.typography ?? {}),
      bidi: {
        // القاعدة الحاكمة: brand.bidi.numerals من العميل، لا موظف.
        ...DEFAULT_BRAND.typography.bidi,
        ...((cfg.typography as { bidi?: object } | undefined)?.bidi ?? {}),
      },
    },
  };
  return resolveBrand(merged);
}

// —— font loading (ADR-006) ———————————————————————————————
// **FONT-1:** الاستدعاء السابق كان `document.fonts.load(...)` وحده،
// ولا `@font-face` مسجَّل في أيّ مكان من الاستوديو — فتُحلّ الوعود
// فوراً بمصفوفة فارغة والمحرك يقيس بخطّ احتياطي بلا صوت. الآن نسجّل
// الخط برمجياً عبر FontFace API قبل الرندر، ونفشل بصوت إن غاب مصدر.

const registeredFontKeys = new Set<string>();

/** DEMO-POLISH §2: يحوّل رسالة خطأ إنجليزيّة خام إلى مفتاح i18n. الواجهة
 * تترجم بـ`t(warning)`. لا نبتلع الفشل — نتيح رسالة عربيّة تقول ما المشكلة
 * وما الخطوة التالية. أيّ خطأ غير معروف يعود بـ`errors.PREVIEW_UNKNOWN`
 * مع الرسالة الأصليّة في السجلّ (السلوك القديم يبقى في `console.error`
 * للمطوّر، الشريك لا يراه). */
export function mapErrorToI18nKey(raw: string): string {
  // eslint-disable-next-line no-console
  console.error('[preview]', raw);
  if (raw.startsWith('font-load-config-missing')) return 'errors.FONT_LOAD_CONFIG_MISSING';
  if (raw.startsWith('font-load-no-source')) return 'errors.FONT_LOAD_NO_SOURCE';
  if (raw.startsWith('font-load-error')) return 'errors.FONT_LOAD_FAILED';
  if (raw.startsWith('asset-no-public-url')) return 'errors.ASSET_NO_PUBLIC_URL';
  if (raw.startsWith('asset-load-failed')) return 'errors.ASSET_LOAD_FAILED';
  if (raw.startsWith('asset-id-empty')) return 'errors.ASSET_ID_EMPTY';
  if (raw.startsWith('canvas.no-2d-context')) return 'errors.CANVAS_NO_CONTEXT';
  return 'errors.PREVIEW_UNKNOWN';
}

/** يترجم رابط الخط النسبي في brand.fonts.primary.weights[*].url
 * (مثل "assets/fonts/Almarai-Regular.ttf") إلى مسار قابل للتحميل
 * في المتصفح (/api/fonts/<basename>). في الإنتاج يجب أن يأتي رابط
 * مطلق من mk-api ⇒ نُبقيه كما هو. */
function toBrowserUrl(rawUrl: string): string {
  if (/^https?:\/\//i.test(rawUrl) || rawUrl.startsWith('/')) return rawUrl;
  const basename = rawUrl.split('/').pop() ?? rawUrl;
  return `/api/fonts/${basename}`;
}

/** الخطوط المدمَجة في المستودع — للاستعمال حين تحمل الهوية الافتراضية
 * `url` فارغاً (DEFAULT_BRAND في packages/shared) أو تُشير إلى `source:
 * 'builtin'` بلا مسار. المفتاح: عائلة الخط. القيمة: خريطة weight ⇢ ملف
 * TTF المسموح في /api/fonts/[name] whitelist. */
const BUILTIN_FONT_FILES: Record<string, Record<'light' | 'regular' | 'bold', string>> = {
  'IBM Plex Sans Arabic': {
    light: 'IBMPlexSansArabic-Light.ttf',
    regular: 'IBMPlexSansArabic-Regular.ttf',
    bold: 'IBMPlexSansArabic-Bold.ttf',
  },
  Almarai: {
    light: 'Almarai-Light.ttf',
    regular: 'Almarai-Regular.ttf',
    bold: 'Almarai-Bold.ttf',
  },
};

interface FontPrimary {
  readonly family: string;
  readonly weights?: Record<string, { url?: string; value?: number } | undefined>;
}

export async function ensureFontLoaded(primary: FontPrimary): Promise<void> {
  if (typeof document === 'undefined') return; // SSR — نتخطّى
  const family = primary.family;
  const weights = primary.weights;
  if (!weights || Object.keys(weights).length === 0) {
    throw new Error(`font-load-config-missing: brand "${family}" has no weights — cannot register FontFace`);
  }

  const builtin = BUILTIN_FONT_FILES[family];
  const tasks: Promise<void>[] = [];
  let cachedAllRequested = true;

  for (const [weightKey, w] of Object.entries(weights)) {
    const value = w?.value ?? { light: 300, regular: 400, bold: 700 }[weightKey] ?? 400;
    const key = `${family}/${value}`;
    if (registeredFontKeys.has(key)) continue;
    cachedAllRequested = false;

    // اختيار المصدر: url من الهوية إن كانت لديه، وإلا خريطة builtin.
    let resolvedUrl: string | undefined = w?.url && w.url.trim() !== '' ? w.url : undefined;
    if (!resolvedUrl && builtin) {
      const wk = weightKey as 'light' | 'regular' | 'bold';
      if (builtin[wk]) resolvedUrl = `assets/fonts/${builtin[wk]}`;
    }
    if (!resolvedUrl) continue; // لا مصدر ولا builtin ⇒ نتخطّى هذا الوزن

    const src = `url(${toBrowserUrl(resolvedUrl)}) format('truetype')`;
    const face = new FontFace(family, src, { weight: String(value), style: 'normal', display: 'block' });
    tasks.push(
      face.load().then((loaded) => {
        document.fonts.add(loaded);
        registeredFontKeys.add(key);
      })
    );
  }

  // كل الأوزان المطلوبة موجودة في cache ⇒ نجاح صامت (مقصود، لا الصمت
  // الذي حاربه FONT-1 — هذا cache hit مشروع، الفشل الأصلي كان بلا cache).
  if (cachedAllRequested && tasks.length === 0) return;

  if (tasks.length === 0) {
    throw new Error(
      `font-load-no-source: brand "${family}" has weights but no url and no builtin mapping — ` +
      `add urls to brand.fonts.primary.weights.*.url or register the family in BUILTIN_FONT_FILES`
    );
  }
  // نفشل بصوت إن فشل أيّ وزن — L-17 (الصمت هو العطب).
  await Promise.all(tasks);
}

/** يرسم إطاراً واحداً على canvas وقت الطلب. عزل عن هوية المستخدم
 * ذاته. تعيد mesure المدّة بالميلي-ثانية. */
export async function drawPreview(
  canvas: HTMLCanvasElement,
  input: PreviewInput
): Promise<PreviewResult> {
  const started = performance.now();

  const brandBase = mergeBrand(input.brandConfig);
  // content.locale (L-49) يقود سلوك المحرّك: اتجاه، كشيدة، كسر دلالي،
  // خط. `applyLocaleToBrand` يبدّل brand مرة واحدة قبل الرندر — الطبقات
  // تقرأ من brand المُعدَّل.
  const contentLocale = ((input.content as { locale?: Locale }).locale ?? 'ar') as Locale;
  const brand = applyLocaleToBrand(brandBase, contentLocale);
  const template = input.template as Parameters<typeof renderFrame>[0]['template'];

  // FONT-1: تسجيل خطوط الهوية وتحميلها فعلياً قبل أيّ measureText داخل
  // المحرك. الاستدعاء السابق `ensureFontLoaded(family, 80)` كان يمرّ
  // صامتاً — الآن يفشل بصوت إن غاب url. الخطأ يُبلَّغ في الـwarning.
  //
  // DEMO-POLISH §2: نُعيد **مفتاح i18n** بدل رسالة إنجليزيّة خام. الواجهة
  // تترجم عبر `t()`. لا نبتلع الخطأ — نغيّر لغته فقط.
  try {
    await ensureFontLoaded(brand.fonts.primary);
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return {
      durationMs: performance.now() - started,
      warning: mapErrorToI18nKey(raw),
    };
  }

  canvas.width = input.size.w;
  canvas.height = input.size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      durationMs: performance.now() - started,
      warning: mapErrorToI18nKey('canvas.no-2d-context'),
    };
  }

  // IMAGE-VERTICAL: حلّ خريطة assetId → HTMLImageElement قبل الرسم.
  // كل خطأ تحميل يُبلَّغ في warning بلا تعطيل باقي الطبقات.
  let resolvedImages: Record<string, HTMLImageElement> | undefined;
  if (input.assetIds && Object.keys(input.assetIds).length > 0) {
    try {
      resolvedImages = await resolveAssetImages(input.assetIds);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return {
        durationMs: performance.now() - started,
        warning: mapErrorToI18nKey(raw),
      };
    }
  }

  try {
    renderFrame({
      ctx: ctx as Parameters<typeof renderFrame>[0]['ctx'],
      size: input.size,
      template,
      brand,
      content: input.content,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(resolvedImages && { assets: { images: resolvedImages } as any }),
    });
  } catch (err) {
    // DEMO-POLISH §2: نمسح القماش بلون التنبيه، بلا نصّ إنجليزيّ خام —
    // الرسالة العربيّة تظهر تحت المعاينة عبر warning i18n key.
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, input.size.w, input.size.h);
    const raw = err instanceof Error ? err.message : 'render-error';
    return {
      durationMs: performance.now() - started,
      warning: mapErrorToI18nKey(raw),
    };
  }

  return { durationMs: performance.now() - started };
}

// —— جدولة: debounce (200ms) + rAF ————————————————————————
// **الاستراتيجية المُعلَنة (PHASES-studio §S13):**
// - كل ضغطة مفتاح تُلغي المؤقّت السابق وتفتح واحداً جديداً بـ200ms.
// - عند انتهاء المؤقّت، `requestAnimationFrame` يُنفّذ الرسم في إطار
//   مستقلّ عن سلسلة الضغطات.
// - العتبة المستهدفة: 50ms لرسم 1080×1080 كامل بعد آخر ضغطة.

interface Scheduler {
  schedule(fn: () => void): void;
  cancel(): void;
}

export function createDebouncedScheduler(delayMs = 200): Scheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rafId: number | null = null;
  return {
    schedule(fn) {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (rafId !== null) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          rafId = null;
          fn();
        });
      }, delayMs);
    },
    cancel() {
      if (timer !== null) clearTimeout(timer);
      if (rafId !== null) cancelAnimationFrame(rafId);
      timer = null;
      rafId = null;
    },
  };
}
