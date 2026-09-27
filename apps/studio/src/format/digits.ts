// أرقام — تبديل بين اللاتينية (`123`) والعربية الهندية (`١٢٣`).
//
// **قاعدة المشروع (`CLAUDE.md §بنود إلزامية للعميل الأول`):** خيار
// الأرقام لكل مستخدم — لا يُفرض. المكوّنات تستدعي `toDigits(value, style)`
// حيث `style` من إعدادات المستخدم.
//
// نستعمل `Intl.NumberFormat` مع locale مناسب — أدق من استبدال حرفي
// (يتعامل مع الفواصل والمنازل العشرية والفاصلة الألفية).

export type DigitStyle = 'latin' | 'arabic-indic';

const AR_FORMATTER = new Intl.NumberFormat('ar-EG-u-nu-arab');
const EN_FORMATTER = new Intl.NumberFormat('en-US');

export function formatNumber(n: number, style: DigitStyle): string {
  return style === 'arabic-indic' ? AR_FORMATTER.format(n) : EN_FORMATTER.format(n);
}

/** يحوّل رقمين عشريين لتقدير أرقام مثل النِسَب. */
export function formatPercent(fraction: number, style: DigitStyle): string {
  const pct = Math.round(fraction * 1000) / 10; // one decimal
  return `${formatNumber(pct, style)}%`;
}

/**
 * يحوّل حجم البايت إلى وحدة قابلة للقراءة (KB/MB/GB) — عمود سعة/حجم.
 * الوحدة تبقى لاتينية دائماً (SI standard)؛ الأرقام تتبع `style`.
 */
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
export function formatBytes(bytes: number, style: DigitStyle): string {
  if (bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const decimals = unit === 0 ? 0 : 1;
  const formatter =
    style === 'arabic-indic'
      ? new Intl.NumberFormat('ar-EG-u-nu-arab', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        })
      : new Intl.NumberFormat('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });
  return `${formatter.format(value)} ${UNITS[unit]}`;
}

/**
 * تبديل حرفي بسيط — يُستعمل حين يكون النصّ جاهزاً (مثلاً معرّف مثل
 * `usr_01H…` لا نغيره، لكن رقم داخل نصّ نغيره).
 */
const LATIN_TO_ARABIC: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
};

export function transliterateDigits(text: string, style: DigitStyle): string {
  if (style !== 'arabic-indic') return text;
  return text.replace(/[0-9]/g, (d) => LATIN_TO_ARABIC[d] ?? d);
}

// ── حقولُ الإدخال الرقميّة (reels/470 §١) ────────────────
// القياسُ قبل الإصلاح: `<input type="number">` تحت lang=ar يُصفّي «3,5»
// و«٣٫٥» إلى ''، وNumber('') = 0 يعبر حارسَ isFinite فيُطحِنُ القيمةَ
// إلى الصفر — عطبُ إدخالٍ لا عطبُ عرض. الحقولُ صارت نصّاً نتحكّمُ
// بصيغته: العرضُ من هنا (بلا تجميعٍ ألفيٍّ — «1,500» في حقلٍ يُعادُ
// قراءتُه تُسمِّمُ القيمة)، والقراءةُ متسامحةٌ لا تُضيع شيئاً.

const AR_FIELD_FORMATTER = new Intl.NumberFormat('ar-EG-u-nu-arab', {
  useGrouping: false,
  maximumFractionDigits: 6,
});
const EN_FIELD_FORMATTER = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 6,
});

/** صيغةُ حقلٍ رقميٍّ — موحَّدةٌ على مبدّل الأرقام القائم، بلا تجميعٍ
 *  ألفيٍّ حتّى لا تُخدَمَ الفاصلةُ الألفيّةُ فاصلةً عشريّةً عند القراءة. */
export function formatFieldNumber(n: number, style: DigitStyle): string {
  return style === 'arabic-indic'
    ? AR_FIELD_FORMATTER.format(n)
    : EN_FIELD_FORMATTER.format(n);
}

/** يقرأُ ما يكتبه المستخدم: أرقامٌ لاتينيّةٌ أو عربيّة-هنديّة، وفاصلةٌ
 *  عشريّةٌ بنقطةٍ أو فاصلةٍ أو ٫، وفاصلةٌ ألفيّةٌ (لاتينيّةٌ أو ٬) تُهمَل.
 *  يُعيدُ null إن لم تُفهم السلسلة — المستدعي يمتنعُ لا أن يخترع. */
export function parseFieldNumber(raw: string): number | null {
  const normalized = raw
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/٬/g, '')
    .replace(/(\d),(\d{3})/g, '$1$2')
    .replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(normalized)) return null;
  const v = Number(normalized);
  return Number.isFinite(v) ? v : null;
}
