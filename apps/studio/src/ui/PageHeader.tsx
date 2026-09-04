'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@/src/i18n/LocaleProvider';

interface Props {
  readonly titleKey: string;
  readonly subtitleKey?: string;
  readonly action?: ReactNode;
}

export function PageHeader({ titleKey, subtitleKey, action }: Props): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{t(titleKey)}</h1>
        {subtitleKey && (
          <p className="mt-1 text-sm text-fg-muted">{t(subtitleKey)}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
