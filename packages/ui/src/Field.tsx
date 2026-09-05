'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@pf-mediakit/i18n';

// Field — يلفّ label + input + help/error. يقرأ i18n keys بدل النصوص
// (L-22 على مستوى الواجهة كذلك — لا نصّ مكرَّر في المكوّنات).

interface Props {
  readonly labelKey: string;
  readonly htmlFor: string;
  readonly helpKey?: string;
  readonly errorKey?: string;
  readonly required?: boolean;
  readonly children: ReactNode;
}

export function Field({
  labelKey,
  htmlFor,
  helpKey,
  errorKey,
  required,
  children,
}: Props): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-fg-muted"
      >
        {t(labelKey)}
        {required && <span className="ms-1 text-danger">*</span>}
      </label>
      {children}
      {errorKey ? (
        <p className="text-[11px] text-danger">{t(errorKey)}</p>
      ) : helpKey ? (
        <p className="text-[11px] text-fg-subtle">{t(helpKey)}</p>
      ) : null}
    </div>
  );
}
