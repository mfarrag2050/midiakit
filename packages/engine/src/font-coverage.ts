// font-coverage — يفحص إن كان الخط يغطّي المحارف المطلوبة للغة.
//
// **الغرض:** حين يرفع العميل خطّاً «لاتينياً» يريد استعماله للتركية،
// وقد يكون بلا `ı ğ ş ç ö ü` — النتيجة: مربّعات فارغة في المخرج.
// نكشف قبل الرفع، لا بعد التصدير (L-47 امتداد).
//
// **البيئة:** يعمل حيث `ctx.measureText` متاح (Canvas 2D + skia-canvas).
// **الحدّ:** لا فحص بايت-بايت لملف الخط — نستعمل قياس ذكي:
// إن أعطى المحرف عرض 0 أو عرضاً مطابقاً لـ.notdef (`�`)، فهو غير
// مدعوم. سريع لكن غير مثالي — قد يفوت خطوطاً تُعيد glyph بديلاً.

import type { CanvasDrawContext } from './text/draw-line.js';

// ── محارف اختبار لكل لغة ───────────────────────────────

/**
 * محارف تُميّز اللغة عن الإنجليزية القياسية. إن قسنا عرضها = عرض
 * `�`، فالخط لا يغطّيها.
 */
const LANGUAGE_TEST_CHARS: Record<string, readonly string[]> = {
  // العربية — نختار محارف مركّبة الشكل + التطويل
  ar: ['ا', 'ب', 'ص', 'ي', 'ة', 'ى', 'ـ', 'ء', 'ؤ', 'ئ'],
  // التركية — الحروف الفريدة
  tr: ['ı', 'İ', 'ğ', 'Ğ', 'ş', 'Ş', 'ç', 'Ç', 'ö', 'Ö', 'ü', 'Ü'],
  // الفرنسية — الحركات الفريدة
  fr: ['é', 'è', 'ê', 'à', 'â', 'ç', 'ù', 'û', 'ô', 'œ', 'æ'],
  // الإسبانية
  es: ['ñ', 'Ñ', 'á', 'é', 'í', 'ó', 'ú', '¿', '¡'],
  // الألمانية
  de: ['ä', 'Ä', 'ö', 'Ö', 'ü', 'Ü', 'ß'],
  // الإنجليزية — لا محارف فريدة (كلها ASCII قياسي)
  en: [],
};

// ── الواجهة ────────────────────────────────────────────

export interface CoverageWarning {
  readonly missingChars: readonly string[];
  readonly locale: string;
  readonly message: string;
}

export interface CheckCoverageOptions {
  /** الخط المفحوص كما يُكتب في `ctx.font` (نموذجياً `700 40px "..."`). */
  readonly fontString: string;
  /** لغات يجب أن يدعمها الخط. */
  readonly locales: readonly string[];
}

/**
 * يفحص تغطية الخط لكل لغة. يعيد تحذيراً لكل لغة فيها محارف مفقودة —
 * فارغ إن كانت كل التغطيات كاملة.
 *
 * المستدعي يعرض التحذيرات في واجهة الرفع (Phase 4) أو يسجّلها في CI.
 * لا throws — الحماية طبقة، لا حاجز.
 */
export function checkFontCoverage(
  ctx: CanvasDrawContext,
  opts: CheckCoverageOptions
): readonly CoverageWarning[] {
  const originalFont = ctx.font;
  try {
    ctx.font = opts.fontString;

    // نقيس محرف .notdef القياسي (`�` = replacement character) —
    // كل خط يرسمه بشكله الافتراضي (مربّع). أيّ محرف بنفس العرض المطابق
    // يُعامَل كمفقود.
    const notdefWidth = ctx.measureText('�').width;

    // بديل ثانٍ: عرض 0 = المحرف غير مُصيَّر أصلاً.
    const isMissing = (ch: string): boolean => {
      const w = ctx.measureText(ch).width;
      if (w === 0) return true;
      // نتساهل بـ0.5px تسامح — بعض المحرّكات تُعيد قيماً fractional.
      if (Math.abs(w - notdefWidth) < 0.5) return true;
      return false;
    };

    const warnings: CoverageWarning[] = [];
    for (const locale of opts.locales) {
      const testChars = LANGUAGE_TEST_CHARS[locale] ?? [];
      if (testChars.length === 0) continue;
      const missing = testChars.filter(isMissing);
      if (missing.length > 0) {
        warnings.push({
          locale,
          missingChars: missing,
          message: `الخط لا يغطّي ${missing.length} محرفاً في ${locale}: ${missing.join(' ')}`,
        });
      }
    }
    return warnings;
  } finally {
    ctx.font = originalFont;
  }
}
