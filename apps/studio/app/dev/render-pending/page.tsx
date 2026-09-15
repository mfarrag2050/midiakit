'use client';

// /dev/render-pending — معرِضُ ٤٠١ — «الانتظارُ ليس نوماً»
//
// **محاكاةٌ معلَنة** (L-123): لا رَندرَ حقيقيّاً هنا — نبني `RenderRow`
// يدوياً بأعمارٍ مختلفة (`createdAt` قديم بمقدار N ثانية) لنقيسَ
// عرضَ `RenderPendingAlert` عبر حالاتٍ متعدّدة.
//
// **العنوانُ يشتقّ من نفس دالّةِ العرض** — لأنّ الجسمَ يحسب العمرَ
// حيّاً من `createdAt` بينما العنوانُ سلسلةٌ ثابتة. لو أبقينا العنوانَ
// حرفيّاً «٨ ثوانٍ» لظهر انحرافُ ثانيتين بعد ثانيتين على الصفحة
// («٨ ثوانٍ» عنواناً · «منذ ١٠ ثانية» جسماً). ننصّ على العمر
// الابتدائيّ في عنوانٍ ثانوٍ، ونشتقّ التمييزَ من الدالّة نفسِها.

import { useEffect, useState, type JSX } from 'react';
import {
  LocaleProvider,
  arPluralCategory,
  useLocale,
} from '@pf-mediakit/i18n';
import { RenderPendingAlert } from '../../../src/ui/RenderPendingAlert';
import type { RenderRow } from '../../../src/api/endpoints/renders';
import { formatNumber, type DigitStyle } from '../../../src/format/digits';

// «قبل» — النصُّ الحرفيّ من `projects/[id]/page.tsx` قبل ٤٠١ §١.
// نبقيه هنا كقياس مرجعيّ يُظهر الفرق مقابل «بعد».
function BeforeSample(): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="text-xs text-fg-muted">
      {t('pages.projects.editor.renderQueued')}
    </div>
  );
}

function mkQueuedRow(ageSec: number, id: string): RenderRow {
  const createdAt = new Date(Date.now() - ageSec * 1_000).toISOString();
  return {
    id,
    project_id: 'prj_dev',
    status: 'queued',
    size: 'x',
    format: 'png',
    output_url: null,
    duration_ms: null,
    brand_snapshot_id: 'bks_dev',
    template_snapshot_id: 'tks_dev',
    createdAt,
    startedAt: null,
    completedAt: null,
  };
}

/** نفسُ منطق `ageText` في `RenderPendingAlert` — مُعرَّف هنا خدمةً للعنوان
 *  فقط، لأنّ الحقيقيّ داخل المكوّن. لو استُخرج ملفّاً مشتركاً استغنى عن
 *  التكرار (ديْنٌ صغيرٌ مقبول: المكوّنُ خاصٌّ، والدالّةُ تعتمد على
 *  المفاتيح المتّفَق عليها). */
function ageTextFor(
  seconds: number,
  style: DigitStyle,
  t: (k: string, p?: Record<string, string | number>) => string,
): string {
  const [n, base] =
    seconds < 60
      ? [seconds, 'renderAgeSeconds' as const]
      : Math.floor(seconds / 60) < 60
        ? [Math.floor(seconds / 60), 'renderAgeMinutes' as const]
        : [Math.floor(seconds / 3600), 'renderAgeHours' as const];
  return t(`pages.projects.editor.${base}.${arPluralCategory(n)}`, {
    n: formatNumber(n, style),
  });
}

/** الحالاتُ — عمرٌ بالثواني + وصفٌ للاختبار (يظهر عن يمين العنوان). */
const CASES: readonly { readonly ageSec: number; readonly note: string; readonly id: string }[] = [
  { ageSec: 1, note: 'مفرد', id: 'rnd_01H7X8ONE1' },
  { ageSec: 2, note: 'مثنّى', id: 'rnd_01H7X8TWO2' },
  { ageSec: 8, note: 'جمع القلّة', id: 'rnd_01H7X8YOUNG' },
  { ageSec: 45, note: 'قبل العتبة', id: 'rnd_01H7X8MID45' },
  { ageSec: 60, note: 'عتبة — تحذير', id: 'rnd_01H7X8AT60' },
  { ageSec: 180, note: 'بعد العتبة — ٣ دقائق', id: 'rnd_01H7X8STUCK' },
  { ageSec: 660, note: 'مفردٌ ما بعد العشرة — ١١ دقيقة', id: 'rnd_01H7X811MIN' },
];

function Gallery(): JSX.Element {
  const { t, locale } = useLocale();
  const style: DigitStyle = locale === 'en' ? 'latin' : 'arabic-indic';
  // نُثبِّت الصفَّ عند تحميل الصفحة كي يبقى `createdAt` مستقرّاً بلا
  // انحرافٍ إن أُعيدَ الرسمُ لسببٍ آخر.
  const [rows] = useState(() =>
    CASES.map((c) => ({ ...c, row: mkQueuedRow(c.ageSec, c.id) })),
  );
  // نتحدّى المعرِضَ بعرضِ العنوان الابتدائيّ + العمر «الآن» جنباً إلى
  // جنب، فيظهر الانحرافُ للناظر إن وُجد (كان ثانيتين قبل ٤٠١).
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      {rows.map(({ ageSec, note, id, row }) => {
        const initialLabel = ageTextFor(ageSec, style, t);
        const nowSec = Math.floor((Date.now() - new Date(row.createdAt).getTime()) / 1000);
        const nowLabel = ageTextFor(nowSec, style, t);
        return (
          <section key={id} className="space-y-2" data-tick={tick}>
            <h2 className="text-sm text-fg-muted">
              <span>{note}</span>
              <span className="mx-2">·</span>
              <span dir="rtl">ابتدأت عند: {initialLabel}</span>
              <span className="mx-2">·</span>
              <span dir="rtl">الآن: {nowLabel}</span>
            </h2>
            <RenderPendingAlert
              row={row}
              onCancel={async (rid) => {
                // stub — لعرضِ الزرّ في المعرِض · لا استدعاءَ API حقيقيّاً
                console.log('[dev] cancel', rid);
              }}
            />
          </section>
        );
      })}
    </>
  );
}

export default function DevRenderPending(): JSX.Element {
  return (
    <LocaleProvider>
      <div className="min-h-screen bg-bg p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-lg font-medium text-fg">
            /dev/render-pending — معرِضُ ٤٠١
          </h1>
          <p className="text-xs text-fg-muted">
            محاكاةُ عميلٍ فقط — لا رَندرَ حقيقيّاً. الغرض: قياسُ عرضِ
            <code className="mx-1 rounded bg-surface-2 px-1 font-mono text-[11px]">RenderPendingAlert</code>
            عبر فئات التمييز الأربع (١ · ٢ · ٣–١٠ · ١١+).
          </p>
          <section className="space-y-2 rounded border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-fg">قبل ٤٠١ §١ — أيُّ عمرٍ يعطي نفسَ النصّ</h2>
            <BeforeSample />
          </section>
          <div className="text-sm font-medium text-fg">بعد ٤٠١ §١+§٤ — العمرُ ظاهر + تمييزٌ صحيح</div>
          <Gallery />
        </div>
      </div>
    </LocaleProvider>
  );
}
