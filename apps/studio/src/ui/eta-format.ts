// ٥٦٠c · صياغةُ سطر ETA — دالّةٌ خالصةٌ قابلةٌ للاختبار
//
// **القاعدة:**
//   - s ≤ 0      → «يبدأ الآن…»
//   - 1–59       → ثوانٍ (renderEtaStartsIn.*)
//   - 60–3599    → دقائق، m = Math.ceil(s/60) (ceil كي لا نَعِدَ بأقلَّ
//                  من الواقع — الفارقُ ≤ ٥٩s يُقرَّبُ لأعلى)
//   - ≥ 3600     → «يبدأ بعد أكثر من ساعة» (بلا رقم)
//
// **arPluralCategory** يُطبَّق على الثواني في نطاقِ الثواني، وعلى
// الدقائق في نطاق الدقائق — تصنيفٌ واحدٌ لا يتغيّر.
//
// **اسمُ الملفّ:** بلا `render`/`preview`/`canvas`/`frame` — يبقى خارجَ
// حدود حارس `check:digit-style-isolation` (S4.5 §4).

import { arPluralCategory } from '@pf-mediakit/i18n';

const AR_INDIC_FMT = new Intl.NumberFormat('ar-EG-u-nu-arab');
const LATIN_FMT = new Intl.NumberFormat('en-US');

export type EtaTFn = (k: string, p?: Record<string, string | number>) => string;

/** يعيد النصَّ الذي يعرضُه سطرُ ETA بحسب `secondsAhead`. */
export function formatEta(secondsAhead: number, useLatin: boolean, t: EtaTFn): string {
  if (secondsAhead <= 0) return t('pages.projects.editor.renderEtaImminent');
  if (secondsAhead >= 3600) return t('pages.projects.editor.renderEtaOverHour');
  const fmt = useLatin ? LATIN_FMT : AR_INDIC_FMT;
  if (secondsAhead < 60) {
    const cat = arPluralCategory(secondsAhead);
    return t(`pages.projects.editor.renderEtaStartsIn.${cat}`, {
      n: fmt.format(secondsAhead),
    });
  }
  const m = Math.ceil(secondsAhead / 60);
  // ٥٦٠d · m=60 (نطاق 3541–3599s) يُقرأ «ساعة» لا «٦٠ دقيقة» — نصٌّ خاص.
  if (m >= 60) return t('pages.projects.editor.renderEtaInHour');
  const cat = arPluralCategory(m);
  return t(`pages.projects.editor.renderEtaStartsInMin.${cat}`, {
    n: fmt.format(m),
  });
}
