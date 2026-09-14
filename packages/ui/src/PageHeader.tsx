'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@pf-mediakit/i18n';

interface Props {
  readonly titleKey: string;
  readonly subtitleKey?: string;
  readonly action?: ReactNode;
}

export function PageHeader({ titleKey, subtitleKey, action }: Props): JSX.Element {
  const { t } = useLocale();
  return (
    // 240-PHONE-WIDTH: على <sm الحركة تنزل تحت العنوان بعرض كامل بدل
    // التضاغط أفقيّاً · على sm+ تعود على اليسار (RTL: end).
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{t(titleKey)}</h1>
        {subtitleKey && (
          <p className="mt-1 text-sm text-fg-muted">{t(subtitleKey)}</p>
        )}
      </div>
      {action && <div className="sm:shrink-0">{action}</div>}
    </div>
  );
}
