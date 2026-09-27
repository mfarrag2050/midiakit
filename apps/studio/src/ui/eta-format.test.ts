// ٥٦٠c · اختبار وحدةٍ لـ`formatEta` — يقرأُ من قواميس i18n الحقيقيّة
// (ar.json · en.json) عبر لوكْأَبٍ صغير مطابقٍ لسلوك `LocaleProvider.t`.
//
// **لماذا لا نستدعي `useLocale`?** الاختبارُ خالصٌ، لا React. الدالّةُ
// تأخذ `t` كوسيط ⇒ نبني `t` من القاموس مباشرةً.

import { describe, expect, it } from 'vitest';
import ar from '../../../../packages/i18n/src/ar.json';
import en from '../../../../packages/i18n/src/en.json';
import { formatEta, type EtaTFn } from './eta-format';

function makeT(dict: Record<string, unknown>): EtaTFn {
  return (key, params) => {
    const parts = key.split('.');
    let node: unknown = dict;
    for (const p of parts) {
      if (typeof node !== 'object' || node === null) throw new Error(`missing: ${key}`);
      node = (node as Record<string, unknown>)[p];
    }
    if (typeof node !== 'string') throw new Error(`not string: ${key}`);
    if (!params) return node;
    return node.replace(/\{(\w+)\}/g, (_, k) =>
      Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`,
    );
  };
}

const tAr = makeT(ar);
const tEn = makeT(en);

interface Row {
  readonly s: number;
  readonly ar: string;
  readonly en: string;
}

// **الجدولُ الحاكم** — يغطّي كلَّ الحدود:
//   ٠ · سالب        → «يبدأ الآن…»
//   ١ · ٢ · ٧ · ٤٣  → صيغُ الثواني الأربع
//   ٥٩              → آخرُ ثانية قبلَ التحوّل
//   ٦٠              → أوّلُ دقيقة (m = ceil(60/60) = 1 → one)
//   ٦١              → m = ceil(61/60) = 2 → two
//   ٧٥              → m = ceil(75/60) = 2 → two
//   ١٢٠             → m = 2 → two
//   ٦٠٠             → m = 10 → few
//   ٣٥٩٩            → m = ceil(3599/60) = 60 → other (آخرُ دقيقة قبل الساعة)
//   ٣٦٠٠            → «يبدأ بعد أكثر من ساعة»
//   ٣٧٠٠            → «يبدأ بعد أكثر من ساعة»
const CASES: readonly Row[] = [
  { s: 0,    ar: 'يبدأ الآن…',              en: 'starting now…' },
  { s: -5,   ar: 'يبدأ الآن…',              en: 'starting now…' },
  { s: 1,    ar: 'يبدأ بعد ثانية',           en: 'starts in 1s' },
  { s: 2,    ar: 'يبدأ بعد ثانيتين',         en: 'starts in 2s' },
  { s: 7,    ar: 'يبدأ بعد ٧ ثوانٍ',         en: 'starts in 7s' },
  { s: 43,   ar: 'يبدأ بعد ٤٣ ثانية',        en: 'starts in 43s' },
  { s: 59,   ar: 'يبدأ بعد ٥٩ ثانية',        en: 'starts in 59s' },
  { s: 60,   ar: 'يبدأ بعد دقيقة',           en: 'starts in 1m' },
  { s: 61,   ar: 'يبدأ بعد دقيقتين',         en: 'starts in 2m' },
  { s: 75,   ar: 'يبدأ بعد دقيقتين',         en: 'starts in 2m' },
  { s: 120,  ar: 'يبدأ بعد دقيقتين',         en: 'starts in 2m' },
  { s: 600,  ar: 'يبدأ بعد ١٠ دقائق',         en: 'starts in 10m' },
  { s: 3540, ar: 'يبدأ بعد ٥٩ دقيقة',         en: 'starts in 59m' },
  { s: 3541, ar: 'يبدأ بعد ساعة',             en: 'starts in 1h' },
  { s: 3599, ar: 'يبدأ بعد ساعة',             en: 'starts in 1h' },
  { s: 3600, ar: 'يبدأ بعد أكثر من ساعة',    en: 'starts in over an hour' },
  { s: 3700, ar: 'يبدأ بعد أكثر من ساعة',    en: 'starts in over an hour' },
];

describe('formatEta · ٥٦٠c — سطرُ ETA بالثواني ثمّ الدقائق ثمّ عتبةُ الساعة', () => {
  for (const { s, ar: expected } of CASES) {
    it(`ar · s=${s} → «${expected}»`, () => {
      expect(formatEta(s, false, tAr)).toBe(expected);
    });
  }
  for (const { s, en: expected } of CASES) {
    it(`en · s=${s} → «${expected}»`, () => {
      expect(formatEta(s, true, tEn)).toBe(expected);
    });
  }
});
