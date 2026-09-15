'use client';

// /dev/render-errors — معرِضٌ لعرضِ فشلِ الرندر في ٣ حالات
//
// **ليس إنتاجاً.** أداةُ قياسٍ بصريّ لتذكرة ٣٩٠. تعرض `RenderFailureAlert`
// مع ٣ رموز خطأ:
//   1. رمزٌ معروفٌ لـFONT — سبيلُه الصفّ B (رَندر) وله مفتاحٌ في `ar.json`
//   2. رمزٌ معروفٌ لصورة — كذلك
//   3. رمزٌ غيرُ معروف (`FROBINATOR_EXPLODED`) — يفعّل fallback (٧٢٠ § F)
//
// **محاكاةٌ معلَنة** (L-123): لا رَندرَ حقيقيّاً هنا — نبني `RenderRow`
// يدوياً بحقلِ `error` كما لو كان من الـAPI. الغايةُ: قياسُ عرضِ
// المكوّن لا صحّةُ الطابور.

import type { JSX } from 'react';
import { LocaleProvider } from '@pf-mediakit/i18n';
import { RenderFailureAlert } from '../../../src/ui/RenderFailureAlert';
import type { RenderRow } from '../../../src/api/endpoints/renders';

function mkFailedRow(code: string, id: string): RenderRow {
  return {
    id,
    project_id: 'prj_dev',
    status: 'failed',
    size: 'x',
    format: 'png',
    output_url: null,
    duration_ms: null,
    brand_snapshot_id: 'bks_dev',
    template_snapshot_id: 'tks_dev',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    error: { code, field: null },
  };
}

const CASES: readonly { readonly title: string; readonly row: RenderRow }[] = [
  { title: 'FONT_LOAD_CONFIG_MISSING (رمزٌ معروفٌ في ar.json)', row: mkFailedRow('FONT_LOAD_CONFIG_MISSING', 'rnd_01H7X8FONT') },
  { title: 'TEMPLATE_SNAPSHOT_INVALID (رمزٌ معروفٌ)', row: mkFailedRow('TEMPLATE_SNAPSHOT_INVALID', 'rnd_01H7X8TSNP') },
  { title: 'FONT_ASSET_MISSING (رمزُ خادمٍ ليس في ar.json — fallback)', row: mkFailedRow('FONT_ASSET_MISSING', 'rnd_01H7X8UFO0') },
];

export default function DevRenderErrors(): JSX.Element {
  return (
    <LocaleProvider>
      <div className="min-h-screen bg-bg p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-lg font-medium text-fg">
            /dev/render-errors — معرِضُ ٣٩٠
          </h1>
          <p className="text-xs text-fg-muted">
            محاكاةُ عميلٍ فقط — لا رَندرَ حقيقيّاً. الغرض: قياسُ عرضِ
            <code className="mx-1 rounded bg-surface-2 px-1 font-mono text-[11px]">RenderFailureAlert</code>
            على رموز خطأ معروفةٍ وغيرِ معروفة.
          </p>
          {CASES.map((c) => (
            <section key={c.row.error!.code} className="space-y-2">
              <h2 className="text-sm text-fg-muted">{c.title}</h2>
              <RenderFailureAlert row={c.row} />
            </section>
          ))}
        </div>
      </div>
    </LocaleProvider>
  );
}
