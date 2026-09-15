'use client';

// ٤٠١ §١ · «الانتظارُ ليس نوماً» — عرضُ العمر
//
// **قبل** (٧٦٠ + ٣٩٠ §١٠): `renderRow.status === 'queued'` كان يُعطي
// نصّاً ثابتاً — «أُرسل التصدير — في الانتظار...» — بلا زمن. رندرٌ
// عمرُه ٨ ثوانٍ ورندرٌ عمرُه ساعةٌ يتشابهان.
//
// **بعد §١:** نُظهر العمرَ الحقيقيّ محسوباً من `createdAt`،
// ومحدَّثاً كلَّ ثانيةٍ عبر setInterval — بدون التحديث الدَّوريّ،
// رندرٌ فُتحت لوحتُه قبل ساعةٍ يبقى «منذ ١٠ ثوانٍ» أبديّاً.

import { useEffect, useState, type JSX } from 'react';
import { useLocale } from '@pf-mediakit/i18n';
import type { RenderRow } from '@/src/api/endpoints/renders';
import { formatNumber, type DigitStyle } from '@/src/format/digits';

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

  const statusLabel =
    row.status === 'running'
      ? t('pages.projects.editor.renderRunning')
      : t('pages.projects.editor.renderQueued');

  return (
    <div className="text-xs text-fg-muted">
      {statusLabel} <span className="mx-1">·</span>
      <span dir="rtl">{t('pages.projects.editor.renderAgeSince', { age: ageText(ageSec, style, t) })}</span>
    </div>
  );
}
