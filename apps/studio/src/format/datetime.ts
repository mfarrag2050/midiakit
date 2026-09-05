// تنسيق الوقت والتاريخ — Intl.DateTimeFormat يحترم locale.
// **قاعدة العرض:** التاريخ في السجلات يعرض قصيراً (2026-09-04 14:23)؛
// النسبي («منذ 3 دقائق») في السياقات الحيّة (feed, notifications).
//
// **الأرقام:** تتبع `DigitStyle` من إعدادات المستخدم — locale محلي
// عربي يعطي أرقاماً هندية، لاتيني يعطي لاتينية. `?locale=` يتقبّل
// override للاختبار.

import type { DigitStyle } from './digits';

interface FormatOptions {
  readonly style: DigitStyle;
  readonly locale: string;
}

/**
 * تاريخ + وقت قصير: `2026-09-04 14:23` (لاتيني) أو `٢٠٢٦-٠٩-٠٤ ١٤:٢٣` (هندي).
 * **الترتيب ثابت YYYY-MM-DD** — لا لبس بين M/D الأميركي وD/M الأوروبي.
 */
export function formatDateTime(iso: string, opts: FormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const localeTag =
    opts.style === 'arabic-indic' ? 'ar-EG-u-nu-arab-ca-gregory' : 'en-CA';
  return new Intl.DateTimeFormat(localeTag, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(d);
}

/** تاريخ فقط. */
export function formatDate(iso: string, opts: FormatOptions): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const localeTag =
    opts.style === 'arabic-indic' ? 'ar-EG-u-nu-arab-ca-gregory' : 'en-CA';
  return new Intl.DateTimeFormat(localeTag, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

/**
 * زمن نسبي (منذ X). عتبات: <60s: "الآن"، <60m: دقائق، <24h: ساعات،
 * <7d: أيام، وإلا التاريخ الكامل.
 * `t()` يُمرَّر من المستدعي — الأداة لا تعرف قواميس.
 */
export function formatRelative(
  iso: string,
  now: Date,
  t: (key: string, params?: Record<string, string | number>) => string,
  opts: FormatOptions
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 0) return t('time.future');
  if (diffSec < 60) return t('time.now');

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t('time.minAgo', { n: numLocal(diffMin, opts) });

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t('time.hourAgo', { n: numLocal(diffH, opts) });

  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return t('time.dayAgo', { n: numLocal(diffD, opts) });

  return formatDate(iso, opts);
}

function numLocal(n: number, opts: FormatOptions): string {
  return opts.style === 'arabic-indic'
    ? new Intl.NumberFormat('ar-EG-u-nu-arab').format(n)
    : String(n);
}
