'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@pf-mediakit/i18n';

interface Props {
  readonly titleKey: string;
  readonly bodyKey?: string;
  // ٤٢٠ §٣: زرّ فعلٍ تالٍ («أنشئ أوّلَ مشروع» …) — الوكالةُ في دقيقتها
  // الأولى ترى كلَّ القوائم فارغة. القائمة بلا فعلٍ تالٍ = طريقٌ مسدود.
  readonly action?: ReactNode;
}

export function EmptyState({ titleKey, bodyKey, action }: Props): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
      <p className="text-sm font-medium text-fg">{t(titleKey)}</p>
      {bodyKey && (
        <p className="mx-auto mt-2 max-w-sm text-xs text-fg-muted">
          {t(bodyKey)}
        </p>
      )}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
