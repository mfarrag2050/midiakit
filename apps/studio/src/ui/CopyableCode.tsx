'use client';

// ٣٩٠ § ٣ · رمزُ الدعم — قابلٌ للنسخِ بضغطة
//
// **مبدأ:** الرمزُ الذي يعبر restart هو معرِّفُ الرندر (UUID)، لا
// `requestId` الذي يعود إلى الصفر مع كلّ إعادة تشغيلٍ لـFastify
// (٧٢٠ §١.٤). نعرضُه هنا مع كلّ فشل.
//
// **قيدٌ عربيّ:** الرمزُ لاتينيٌّ داخل نصٍّ عربيّ ⇒ `<span dir="ltr">`
// وخطٌّ وحيدُ العرض حتّى لا يقلبَ BiDi أرقامَه، وتُنسَخ السلسلةُ
// كما تُقرأ. الزرُّ نفسُه محايد الاتّجاه.

import { useState, type JSX } from 'react';
import { useLocale } from '@pf-mediakit/i18n';

interface Props {
  readonly value: string;
  readonly labelKey?: string; // مفتاحُ ترجمةِ الوسم قبل الرمز
}

export function CopyableCode({ value, labelKey }: Props): JSX.Element {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* بعض المتصفّحات ترفض clipboard خارج user gesture — نتجاهل بصمت */
    }
  }

  return (
    <span className="inline-flex items-center gap-2 align-baseline">
      {labelKey && (
        <span className="text-xs text-fg-muted">{t(labelKey)}</span>
      )}
      <span
        dir="ltr"
        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t('actions.copy')}
        className="rounded border border-border bg-surface px-2 py-0.5 text-[11px] text-fg-muted hover:bg-surface-2 hover:text-fg"
      >
        {copied ? t('actions.copied') : t('actions.copy')}
      </button>
    </span>
  );
}
