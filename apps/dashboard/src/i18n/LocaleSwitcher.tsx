'use client';

import { useLocale, type Locale } from './LocaleProvider';

const OPTIONS: readonly Locale[] = ['ar', 'mixed', 'en'];

export function LocaleSwitcher(): JSX.Element {
  const { locale, setLocale, t } = useLocale();
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-white/40">{t('locale.label')}:</span>
      <div className="flex overflow-hidden rounded-md border border-white/10">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            onClick={() => setLocale(opt)}
            className={
              (opt === locale
                ? 'bg-white/20 text-white'
                : 'bg-transparent text-white/50 hover:bg-white/10') +
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
