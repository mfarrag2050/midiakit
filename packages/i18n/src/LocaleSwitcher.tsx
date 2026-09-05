'use client';

import { useLocale, type Locale } from './LocaleProvider';

const OPTIONS: readonly Locale[] = ['ar', 'mixed', 'en'];

export function LocaleSwitcher(): JSX.Element {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-fg-subtle">{t('locale.label')}:</span>
      <div className="flex overflow-hidden rounded border border-border">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => setLocale(opt)}
            className={
              (opt === locale
                ? 'bg-surface-2 text-fg'
                : 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg') +
              ' px-2 py-1'
            }
          >
            {t(`locale.${opt}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
