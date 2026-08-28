// تحميل الخطوط — يقابل cvEnsureFontsThenRender في المرجع
// (INVENTORY 1584–1591: document.fonts.load لأوزان الخط قبل الرندر).
//
// السبب: ADR-006 — أي `measureText` قبل جاهزية الخط يعطي نتائج
// مضلّلة (يعتمد على fallback). كل مسار قياس يجب أن يمرّ ببوابة
// جاهزية.
//
// واجهة قابلة للحقن على نمط Measurer:
//   • createBrowserFontLoader — يستقبل FontFaceSet من الاستدعاء
//     (لا document في المحرك). الواجهة في studio تمرّر `document.fonts`.
//   • createManualFontLoader — للاختبارات؛ يتحكّم المستدعي بالتوقيت.
//
// بوابة الالتزام: createGatedMeasurer يلفّ Measurer فيرمي قبل الجاهزية.
// اختبار «القياس لا يبدأ قبل اكتمال التحميل» يستند إليه.

import type { BrandKit } from '@pf-mediakit/shared';
import type { Measurer } from './measurer.js';

// ── الحد الأدنى من CSS Font Loading API ────────────────
//
// لا نستورد lib.dom — نُعرّف الشكل الذي نحتاجه فقط. يتوافق مع
// `document.fonts` في المتصفح ومع polyfill في skia-canvas.
export interface FontFaceSetLike {
  load(font: string, text?: string): Promise<readonly unknown[]>;
}

export interface FontLoadResult {
  readonly loaded: readonly string[];
  readonly failed: readonly string[];
}

export interface FontLoader {
  /** يحمّل كل الأوزان المُعلَنة في brand.fonts.primary.weights. */
  load(brand: BrandKit): Promise<FontLoadResult>;
  /** true بعد آخر load ناجح (كامل أو جزئي — نتساهل مع fallback). */
  isReady(): boolean;
}

// ── مساعد: بناء سلاسل font لكل وزن ─────────────────────

const CANONICAL_SIZE_PX = 80;

/**
 * يبني قائمة سلاسل font يجب تحميلها من BrandKit.
 * الحجم قيمة رمزية — CSS Font Loading يعتني بالوزن لا بالحجم لتحديد الوجه.
 */
export function fontStringsForBrand(brand: BrandKit): readonly string[] {
  const family = `"${brand.fonts.primary.family}"`;
  const w = brand.fonts.primary.weights;
  return [
    `${w.light.value} ${CANONICAL_SIZE_PX}px ${family}`,
    `${w.regular.value} ${CANONICAL_SIZE_PX}px ${family}`,
    `${w.bold.value} ${CANONICAL_SIZE_PX}px ${family}`,
  ];
}

// ── منفّذ المتصفح ──────────────────────────────────────

interface BrowserLoaderState {
  ready: boolean;
}

/**
 * ينتج FontLoader يستدعي fontFaceSet.load لكل وزن.
 * أي فشل فردي لا يوقف الجاهزية (fallback مقبول للسطح البصري)،
 * لكنه يُسجَّل في failed لتشخيص لاحق.
 */
export function createBrowserFontLoader(
  fontFaceSet: FontFaceSetLike
): FontLoader {
  const state: BrowserLoaderState = { ready: false };

  return {
    async load(brand: BrandKit): Promise<FontLoadResult> {
      const fonts = fontStringsForBrand(brand);
      const results = await Promise.allSettled(
        fonts.map((f) => fontFaceSet.load(f))
      );
      const loaded: string[] = [];
      const failed: string[] = [];
      results.forEach((r, i) => {
        (r.status === 'fulfilled' ? loaded : failed).push(fonts[i]!);
      });
      state.ready = true;
      return { loaded, failed };
    },
    isReady(): boolean {
      return state.ready;
    },
  };
}

// ── منفّذ يدوي (اختبارات) ──────────────────────────────

export interface ManualFontLoader extends FontLoader {
  /** يحرّر آخر وعد load بنتيجة محددة (الافتراضي: كل شيء نجح). */
  resolve(result?: FontLoadResult): void;
  /** يرفض آخر وعد load. */
  reject(err?: Error): void;
  /** كم مرة استُدعي load — لكشف الاستدعاء المكرر. */
  loadCallCount(): number;
}

interface ManualPending {
  readonly resolve: (r: FontLoadResult) => void;
  readonly reject: (e: Error) => void;
  readonly fonts: readonly string[];
}

/**
 * FontLoader يمنح المستدعي التحكّم الكامل بتوقيت الجاهزية.
 * الاستدعاء الوحيد لـload يُعيد Promise معلَّق حتى resolve/reject.
 */
export function createManualFontLoader(): ManualFontLoader {
  const state: {
    ready: boolean;
    pending: ManualPending | null;
    callCount: number;
  } = {
    ready: false,
    pending: null,
    callCount: 0,
  };

  return {
    load(brand: BrandKit): Promise<FontLoadResult> {
      state.callCount++;
      const fonts = fontStringsForBrand(brand);
      return new Promise<FontLoadResult>((res, rej) => {
        state.pending = {
          fonts,
          resolve: (r) => {
            state.ready = true;
            res(r);
          },
          reject: (e) => rej(e),
        };
      });
    },
    isReady(): boolean {
      return state.ready;
    },
    resolve(result?: FontLoadResult): void {
      const p = state.pending;
      if (!p) throw new Error('createManualFontLoader: لا وعد معلَّق ليُحرَّر');
      state.pending = null;
      p.resolve(result ?? { loaded: p.fonts, failed: [] });
    },
    reject(err?: Error): void {
      const p = state.pending;
      if (!p) throw new Error('createManualFontLoader: لا وعد معلَّق ليُرفض');
      state.pending = null;
      p.reject(err ?? new Error('font load rejected'));
    },
    loadCallCount(): number {
      return state.callCount;
    },
  };
}

// ── بوابة القياس ───────────────────────────────────────

/**
 * يلفّ Measurer فيرمي إن استُدعي قبل جاهزية الخطوط.
 * يجعل ADR-006 قابلاً للتنفيذ اختبارياً: لا measureText قبل load.
 *
 * الاستعمال: بعد `await loader.load(brand)` تصبح كل النداءات تمر بلا رمي.
 */
export function createGatedMeasurer(
  loader: FontLoader,
  inner: Measurer
): Measurer {
  const gate = (): void => {
    if (!loader.isReady()) {
      throw new Error(
        'قياس قبل جاهزية الخط — ADR-006 يمنعه. انتظر loader.load(brand) أولاً.'
      );
    }
  };

  return {
    word(tok, fs, allBold) {
      gate();
      return inner.word(tok, fs, allBold);
    },
    space(fs) {
      gate();
      return inner.space(fs);
    },
    line(toks, fs, allBold) {
      gate();
      return inner.line(toks, fs, allBold);
    },
  };
}
