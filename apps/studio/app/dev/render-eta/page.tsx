'use client';

// /dev/render-eta — معرِضُ ٥٦٠ — «بدء بعد Ns»
//
// **محاكاةٌ معلَنة:** نصنعُ ETA وهميّةً بعِدّةِ ثوانٍ في المستقبل ونمرّرُها
// إلى `RenderEtaLine` عبر `estimatedStartAtOverride` — لنُشاهد سلوكَ
// السطرِ عند حالاتِ الرَندر الثلاث + الحالةِ الخالية.

import { useEffect, useState, type JSX } from 'react';
import { LocaleProvider } from '@pf-mediakit/i18n';
import { RenderEtaLine } from '../../../src/ui/RenderEtaLine';

type Status = 'queued' | 'running' | 'succeeded';

interface Case {
  readonly id: string;
  readonly note: string;
  readonly status: Status;
  /** null = «الحقلُ غائبٌ من الخادم» — نتحقّق أنّ السطرَ يختفي. */
  readonly etaOverride: string | null;
}

function futureIso(secondsAhead: number): string {
  return new Date(Date.now() + secondsAhead * 1_000).toISOString();
}

function buildCases(): readonly Case[] {
  return [
    { id: 'dev_q1', note: 'queued · ثواني · مفرد', status: 'queued', etaOverride: futureIso(3) },
    { id: 'dev_q2', note: 'queued · ثواني · مثنّى', status: 'queued', etaOverride: futureIso(4) },
    { id: 'dev_q7', note: 'queued · ثواني · جمع القلّة', status: 'queued', etaOverride: futureIso(9) },
    { id: 'dev_q45', note: 'queued · ثواني · مفرد بعد العشرة', status: 'queued', etaOverride: futureIso(45) },
    { id: 'dev_m75',   note: 'queued · دقائق · ٧٥s → دقيقتين', status: 'queued', etaOverride: futureIso(75) },
    { id: 'dev_m600',  note: 'queued · دقائق · ٦٠٠s → ١٠ دقائق', status: 'queued', etaOverride: futureIso(600) },
    { id: 'dev_over',  note: 'queued · تجاوزَ الساعة · ٣٧٠٠s', status: 'queued', etaOverride: futureIso(3700) },
    { id: 'dev_run', note: 'running · نُخفي الرقم (لم يعُدْ ذا معنى)', status: 'running', etaOverride: futureIso(30) },
    { id: 'dev_ok', note: 'succeeded · نُخفي الرقم', status: 'succeeded', etaOverride: futureIso(0) },
    { id: 'dev_null', note: 'queued · الخادمُ لم يُرجِعْ ETA — يختفي بلا خطأ', status: 'queued', etaOverride: null },
  ];
}

function Gallery(): JSX.Element | null {
  // SSR-آمن: ETA يعتمدُ على `Date.now()` — نبني الحالاتِ بعد mount.
  const [cases, setCases] = useState<readonly Case[] | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setCases(buildCases());
    const id = setInterval(() => setTick((n) => n + 1), 1_000);
    return () => clearInterval(id);
  }, []);
  if (!cases) return null;
  return (
    <div className="space-y-4" data-tick={tick}>
      {cases.map((c) => (
        <section key={c.id} className="space-y-1 rounded border border-border bg-surface p-3">
          <div className="text-[11px] text-fg-subtle" dir="rtl">{c.note}</div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-surface-2 px-2 py-0.5 text-[10px] uppercase text-fg-muted">
              {c.status}
            </span>
            <RenderEtaLine
              renderId={c.id}
              status={c.status}
              estimatedStartAtOverride={c.etaOverride}
            />
            {c.etaOverride === null && c.status === 'queued' && (
              <span className="text-[11px] text-fg-subtle" dir="rtl">
                (لا سطرَ ETA — الشاشةُ لم تُكسَر)
              </span>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function DevRenderEta(): JSX.Element {
  return (
    <LocaleProvider>
      <div className="min-h-screen bg-bg p-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <h1 className="text-lg font-medium text-fg">
            /dev/render-eta — معرِضُ ٥٦٠
          </h1>
          <p className="text-xs text-fg-muted" dir="rtl">
            محاكاةُ عميلٍ فقط — `estimatedStartAtOverride` يُمرَّر مباشرةً. في
            الإنتاج يأتي الرقمُ من `renderEtaStore` الذي يلتقطُه لحظةَ POST
            /v1/renders.
          </p>
          <Gallery />
        </div>
      </div>
    </LocaleProvider>
  );
}
