'use client';

// ٥٦٠ · «بدء بعد Ns» — سطرٌ حيٌّ للرَندرات المُنتظِرة
//
// **المصدر:** `renderEtaStore` يحفظ `estimatedStartAt` لحظةَ POST
// /v1/renders (الحقلُ الوحيدُ الذي يعيدُه الخادمُ · لا يظهرُ في GET/list).
// **الحساب:** `max(0, floor((etaMs - now)/1000))` — كلَّ ثانية.
// **الحالةُ الخالية:** لا معرِّفٌ في المخزَن ⇒ يعيد `null` (الأبُ يُخفي).
// **الانتقال:** حين يخرج الرَندرُ من `queued` (running/succeeded/…) نُخفي —
// الرقمُ لم يعُدْ ذا معنى.
// **الأرقام:** حسب locale (ar → هنديّة · en → لاتينيّة) — نفسُ نمط
// `RenderPendingAlert` (٤٠١ §٤٣٩). لا استيرادَ من `format/digits` لأنّ
// اسمَ الملفّ يحوي «render» (حارس `check:digit-style-isolation`).

import { useEffect, useState, type JSX } from 'react';
import { arPluralCategory, useLocale } from '@pf-mediakit/i18n';
import { get as getStoredEta, subscribe } from '@/src/api/renderEtaStore';

const AR_INDIC_FMT = new Intl.NumberFormat('ar-EG-u-nu-arab');
const LATIN_FMT = new Intl.NumberFormat('en-US');

type TFn = (k: string, p?: Record<string, string | number>) => string;

interface Props {
  readonly renderId: string;
  readonly status: string;
  /** `null` يعني «الأبُ لا يمرّرُ ETA خارجيّاً» — نقرأ من المخزَن. حين
   *  يمرّرُ الأبُ قيمةً (كما في المعرِض) نستعملُها مباشرةً. */
  readonly estimatedStartAtOverride?: string | null;
  readonly className?: string;
}

function etaText(secondsAhead: number, useLatin: boolean, t: TFn): string {
  if (secondsAhead <= 0) return t('pages.projects.editor.renderEtaImminent');
  const cat = arPluralCategory(secondsAhead);
  const nStr = useLatin ? LATIN_FMT.format(secondsAhead) : AR_INDIC_FMT.format(secondsAhead);
  return t(`pages.projects.editor.renderEtaStartsIn.${cat}`, { n: nStr });
}

export function RenderEtaLine({
  renderId,
  status,
  estimatedStartAtOverride,
  className,
}: Props): JSX.Element | null {
  const { t, locale } = useLocale();
  // SSR-آمن: أثناءَ الرَندرِ على الخادمِ `Date.now()` مختلفٌ عنه على العميل
  // ⇒ hydration mismatch. نُخفي حتّى أوّلِ mount (effect لا يشتغلُ على SSR).
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [storedEta, setStoredEta] = useState<string | null>(
    estimatedStartAtOverride === undefined ? null : (estimatedStartAtOverride ?? null),
  );

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    if (estimatedStartAtOverride !== undefined) return;
    setStoredEta(getStoredEta(renderId));
    return subscribe(() => setStoredEta(getStoredEta(renderId)));
  }, [renderId, estimatedStartAtOverride]);

  useEffect(() => {
    if (!mounted) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [mounted]);

  if (!mounted) return null;

  const eta = estimatedStartAtOverride !== undefined ? (estimatedStartAtOverride ?? null) : storedEta;

  // الخفاء الآمن: لا ETA · أو خرج من queued.
  if (!eta) return null;
  if (status !== 'queued') return null;

  const etaMs = new Date(eta).getTime();
  if (!Number.isFinite(etaMs)) return null;
  const secondsAhead = Math.max(0, Math.floor((etaMs - nowMs) / 1_000));

  return (
    <span dir="rtl" className={className ?? 'text-xs text-fg-subtle tabular'}>
      {etaText(secondsAhead, locale === 'en', t)}
    </span>
  );
}
