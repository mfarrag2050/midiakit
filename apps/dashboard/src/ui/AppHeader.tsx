'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@/src/i18n/LocaleProvider';

export function AppHeader({ children }: { children?: ReactNode }): JSX.Element {
  const { t } = useLocale();
  return (
    <header className="mb-6 flex items-center justify-between gap-4 border-b border-white/10 pb-4">
      <div className="min-w-0">
        <h1 className="text-lg font-bold">{t('nav.title')}</h1>
        <p className="text-xs text-white/50">{t('nav.subtitle')}</p>
      </div>
      <nav className="flex items-center gap-3 text-sm">
        <a
          href="/client"
          className="rounded-md bg-white/5 px-3 py-1.5 hover:bg-white/10"
        >
          {t('nav.client')}
        </a>
        <a
          href="/ops"
          className="rounded-md bg-white/5 px-3 py-1.5 hover:bg-white/10"
        >
          {t('nav.ops')}
        </a>
        {children}
      </nav>
    </header>
  );
}
