'use client';

// /dev/render-pending — معرِضُ ٤٠١ — «الانتظارُ ليس نوماً»
//
// **محاكاةٌ معلَنة** (L-123): لا رَندرَ حقيقيّاً هنا — نبني `RenderRow`
// يدوياً بأعمارٍ مختلفة (`createdAt` قديم بمقدار N ثانية) لنقيسَ
// عرضَ `RenderPendingAlert` عبر ثلاث حالات:
//   - عمرٌ حديث (٨ ثوانٍ) — طمأنة
//   - عمرٌ متوسّط (٤٥ ثانية) — طمأنة قبل العتبة
//   - عمرٌ متجاوزٌ للعتبة (٣ دقائق) — تحذير (بعد §٢)

import type { JSX } from 'react';
import { LocaleProvider, useLocale } from '@pf-mediakit/i18n';
import { RenderPendingAlert } from '../../../src/ui/RenderPendingAlert';
import type { RenderRow } from '../../../src/api/endpoints/renders';

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

const CASES: readonly { readonly title: string; readonly row: RenderRow }[] = [
  { title: 'عمرٌ حديث · ٨ ثوانٍ', row: mkQueuedRow(8, 'rnd_01H7X8YOUNG') },
  { title: 'عمرٌ متوسّط · ٤٥ ثانية', row: mkQueuedRow(45, 'rnd_01H7X8MID45') },
  { title: 'عمرٌ متجاوزٌ للعتبة · ٣ دقائق', row: mkQueuedRow(180, 'rnd_01H7X8STUCK') },
];

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
            على ثلاثة أعمار.
          </p>
          <section className="space-y-2 rounded border border-border bg-surface p-4">
            <h2 className="text-sm font-medium text-fg">قبل ٤٠١ §١ — أيُّ عمرٍ يعطي نفسَ النصّ</h2>
            <BeforeSample />
          </section>
          <div className="text-sm font-medium text-fg">بعد ٤٠١ §١ — العمرُ ظاهر</div>
          {CASES.map((c) => (
            <section key={c.row.id} className="space-y-2">
              <h2 className="text-sm text-fg-muted">{c.title}</h2>
              <RenderPendingAlert row={c.row} />
            </section>
          ))}
        </div>
      </div>
    </LocaleProvider>
  );
}
