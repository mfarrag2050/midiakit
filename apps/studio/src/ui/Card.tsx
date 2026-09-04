'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@/src/i18n/LocaleProvider';

// Card — سطح بحدود لطيفة، عنوان اختياري وشريط أفعال ذيلي.

interface Props {
  readonly titleKey?: string;
  readonly subtitleKey?: string;
  readonly headerAction?: ReactNode;
  readonly footer?: ReactNode;
  readonly padded?: boolean;
  readonly children: ReactNode;
}

export function Card({
  titleKey,
  subtitleKey,
  headerAction,
  footer,
  padded = true,
  children,
}: Props): JSX.Element {
  const { t } = useLocale();
  const hasHeader = titleKey || subtitleKey || headerAction;
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-3">
          <div className="min-w-0">
            {titleKey && (
              <h2 className="text-sm font-semibold text-fg">{t(titleKey)}</h2>
            )}
            {subtitleKey && (
              <p className="mt-0.5 text-xs text-fg-muted">{t(subtitleKey)}</p>
            )}
          </div>
          {headerAction && <div className="shrink-0">{headerAction}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
      {footer && (
        <footer className="border-t border-border bg-surface-2 px-5 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}
