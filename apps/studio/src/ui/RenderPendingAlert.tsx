'use client';

// ٤٠١ · «الانتظارُ ليس نوماً» — عمر + عتبة + مخرج
//
// **§١** — عرضُ العمر محسوباً من `createdAt`، محدَّثاً كلَّ ثانيةٍ.
// **§٢** — بعد العتبةِ المُعاعرة `STUCK_THRESHOLD_SECONDS` يتحوّل
//         العرضُ من نصٍّ مُطمْئنٍ إلى `Alert kind="warning"` مع رمزِ
//         الحادثة قابلاً للنسخ (يُبنى في ٣٩٠ §٣).
// **§٣** — مؤجَّل: زرُّ إلغاءٍ + مخارجُ أخرى.
//
// ═══════════════════════════════════════════════════════════════════
// **§الأساس · معايرةُ العتبة `60s`** — اعترافٌ إلزاميّ كبوّابة الحبر:
//
//   • `docs/09` يستهدف P95 wait time ≤ 45s للطابور تحت الذروة.
//     تجاوزُ 45s معناه: نحن خارج الحال الطبيعيّ.
//   • `docs/08` يحدّد timeout الخادم للرندر البسيط بـ 90s.
//     نُحذّر قبله (60 < 90) لنترك للمستخدم زمناً للتصرّف.
//   • رندرٌ ناجحٌ نموذجيّ ~15s في peak (مذكور في PHASES). 60s = 4×.
//
//   **حدٌّ مُعاعرٌ لا مُقاسٌ على استعمالٍ حقيقيّ.** ثلاثةُ حدود لهذا
//   الرقم يجب الاعترافُ بها:
//     1. **false-positive على طوابيرَ عادلةٍ مزدحمة** — وكالةٌ دفعت
//        ١٥ رندراً دفعةً · `perTenantCap=4` (٧٦٠) · `moveToDelayed`
//        (mk-api الأخير) — الرندرُ الخامس يُؤجَّل بشرعيّة، لكنّه
//        سيبلغ ٦٠s قبل أن يعمل. سيرى المستخدم تحذيراً مضلِّلاً.
//     2. **الاستوديو لا يعرف تمييزَ delayed من stuck** — الحقلُ
//        المطلوب من mk-api موصوفٌ أدناه في §الحقل المطلوب.
//     3. **قابلٌ للمعايرة بعد أوّل شهر إنتاج** — بعد جمعِ توزيعِ
//        أعمار الرندرات الفعليّة يمكن ضبطُ العتبة بيقين.
//
// **الحقلُ المطلوب من mk-api لتضييق false-positives:** حقلٌ
// اختياريٌّ في `GET /v1/renders/:id` مثل:
//   {
//     ...,
//     queue_state: "active" | "delayed",   // BullMQ job state
//     delayed_until: string | null,        // ISO timestamp أو null
//     attempt: number                       // كم مرّةً حاول العامل
//   }
// حينَها: `delayed && attempt < 3` = مؤجَّل شرعيّاً (ننتظر بلا تحذير).
// `active && ageSec > 60` = العاملُ حاول ولم يُنهِ · العتبةُ صادقة.
// حاليّاً: لا شيء منها في الرَّدّ — نتّكل على العمر وحدَه.
// ═══════════════════════════════════════════════════════════════════

import { useEffect, useState, type JSX } from 'react';
import { Alert } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import type { RenderRow } from '@/src/api/endpoints/renders';
import { formatNumber, type DigitStyle } from '@/src/format/digits';
import { CopyableCode } from './CopyableCode';

const STUCK_THRESHOLD_SECONDS = 60;

type TFn = (k: string, p?: Record<string, string | number>) => string;

/** يعيد النصَّ العربيّ لعمرِ الانتظار — «٨ ثوانٍ» · «٣ دقائق» · «ساعة».
 *  الأرقامُ حسب نمط اللغة (٣٨٠ §٢): `ar`/`mixed` هنديّة · `en` لاتينيّة. */
function ageText(seconds: number, style: DigitStyle, t: TFn): string {
  if (seconds < 60) return t('pages.projects.editor.renderAgeSeconds', { n: formatNumber(seconds, style) });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('pages.projects.editor.renderAgeMinutes', { n: formatNumber(minutes, style) });
  const hours = Math.floor(minutes / 60);
  return t('pages.projects.editor.renderAgeHours', { n: formatNumber(hours, style) });
}

export function RenderPendingAlert({ row }: { row: RenderRow }): JSX.Element {
  const { t, locale } = useLocale();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  const ageMs = Math.max(0, nowMs - new Date(row.createdAt).getTime());
  const ageSec = Math.floor(ageMs / 1_000);
  const style: DigitStyle = locale === 'en' ? 'latin' : 'arabic-indic';
  const isStuck = ageSec >= STUCK_THRESHOLD_SECONDS;

  const statusLabel =
    row.status === 'running'
      ? t('pages.projects.editor.renderRunning')
      : t('pages.projects.editor.renderQueued');
  const age = ageText(ageSec, style, t);

  // — قبل العتبة: طمأنةٌ هادئة —
  if (!isStuck) {
    return (
      <div className="text-xs text-fg-muted">
        {statusLabel} <span className="mx-1">·</span>
        <span dir="rtl">{t('pages.projects.editor.renderAgeSince', { age })}</span>
      </div>
    );
  }

  // — بعد العتبة: تحذيرٌ + رمزُ الحادثة —
  return (
    <Alert kind="warning" titleKey="pages.projects.editor.renderStuckTitle">
      <p className="text-xs text-fg-muted">
        {t('pages.projects.editor.renderStuckBody', { age })}
      </p>
      <div className="mt-2">
        <CopyableCode value={row.id} labelKey="pages.projects.editor.renderIdLabel" />
      </div>
    </Alert>
  );
}
