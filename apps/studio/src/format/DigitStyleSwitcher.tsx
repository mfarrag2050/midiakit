'use client';

import { useDigitStyle } from './settings';
import type { DigitStyle } from './digits';
import { useLocale } from '@pf-mediakit/i18n';

const OPTIONS: readonly DigitStyle[] = ['latin', 'arabic-indic'];

export function DigitStyleSwitcher(): JSX.Element {
  const { style, set } = useDigitStyle();
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-1 text-xs">
      <span className="text-fg-subtle">{t('digits.label')}:</span>
      <div className="flex overflow-hidden rounded border border-border">
        {OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => set(opt)}
            className={
              (opt === style
                ? 'bg-surface-2 text-fg'
                : 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg') +
              ' px-2 py-1'
            }
          >
            {t(`digits.${opt === 'latin' ? 'latin' : 'arabicIndic'}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
