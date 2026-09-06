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

import { renderFrame, resolveBrand } from '@pf-mediakit/engine';
import type { BrandKit } from '@pf-mediakit/shared';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';

export interface PreviewInput {
  readonly template: unknown;
  readonly brandConfig: unknown;
  readonly content: Readonly<Record<string, unknown>>;
  readonly size: { readonly w: number; readonly h: number };
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
    fonts: { ...DEFAULT_BRAND.fonts, ...(cfg.fonts ?? {}) },
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
// نطلب تحميل عائلة الخط الأساسية بحجم مرجعي واحد. `document.fonts.load`
// يعيد promise يحلّ عند اكتمال الملف. لا `measureText` قبله.
const loadedFontsCache = new Set<string>();

export async function ensureFontLoaded(family: string, sizePx = 80): Promise<void> {
  const key = `${sizePx}px "${family}"`;
  if (loadedFontsCache.has(key)) return;
  if (typeof document === 'undefined') return; // SSR — نتخطّى
  try {
    await document.fonts.load(key);
    loadedFontsCache.add(key);
  } catch {
    // فشل التحميل — نتابع دون كسر، الخط الافتراضي المتصفّحي يعمل.
  }
}

/** يرسم إطاراً واحداً على canvas وقت الطلب. عزل عن هوية المستخدم
 * ذاته. تعيد mesure المدّة بالميلي-ثانية. */
export async function drawPreview(
  canvas: HTMLCanvasElement,
  input: PreviewInput
): Promise<PreviewResult> {
  const started = performance.now();

  const brand = mergeBrand(input.brandConfig);
  const template = input.template as Parameters<typeof renderFrame>[0]['template'];

  // انتظار تحميل الخط قبل أي measureText داخل المحرك.
  await ensureFontLoaded(brand.fonts.primary.family, 80);

  canvas.width = input.size.w;
  canvas.height = input.size.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      durationMs: performance.now() - started,
      warning: 'canvas.no-2d-context',
    };
  }

  try {
    renderFrame({
      ctx: ctx as Parameters<typeof renderFrame>[0]['ctx'],
      size: input.size,
      template,
      brand,
      content: input.content,
    });
  } catch (err) {
    // القالب أو المحتوى غير صالح — نطبع رسالة على القماش بدل الانفجار.
    ctx.fillStyle = '#161616';
    ctx.fillRect(0, 0, input.size.w, input.size.h);
    ctx.fillStyle = '#e5484d';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const msg = err instanceof Error ? err.message : 'render-error';
    ctx.fillText(msg.slice(0, 80), input.size.w / 2, input.size.h / 2);
    return {
      durationMs: performance.now() - started,
      warning: msg,
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
