'use client';

// S1: stub LocaleProvider — يمرّر المفاتيح كما هي.
// S3 يُبدّله بتنفيذ كامل يعتمد نمط `apps/dashboard/src/i18n/LocaleProvider.tsx`
// (ar/mixed/en، localStorage، dir/lang على <html>).

import { createContext, useContext, useEffect, type ReactNode } from 'react';

export type Locale = 'ar' | 'mixed' | 'en';

interface LocaleContext {
  readonly locale: Locale;
  setLocale(next: Locale): void;
  t(key: string, params?: Record<string, string | number>): string;
}

const Ctx = createContext<LocaleContext | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }): JSX.Element {
  useEffect(() => {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = 'ar';
  }, []);

  const value: LocaleContext = {
    locale: 'ar',
    setLocale: () => {
      /* stub — S3 يفعّله */
    },
    t: (key) => key,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocale خارج LocaleProvider');
  return v;
}
