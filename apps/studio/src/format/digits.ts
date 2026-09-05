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
