'use client';

import { useLocale } from '@/src/i18n/LocaleProvider';

interface Props {
  readonly titleKey: string;
  readonly bodyKey?: string;
}

export function EmptyState({ titleKey, bodyKey }: Props): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface/40 px-6 py-16 text-center">
      <p className="text-sm font-medium text-fg">{t(titleKey)}</p>
      {bodyKey && (
        <p className="mx-auto mt-2 max-w-sm text-xs text-fg-muted">
          {t(bodyKey)}
        </p>
      )}
    </div>
  );
}
