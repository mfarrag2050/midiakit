'use client';

// i18n — نظام لغات خفيف بلا مكتبة (docs/08 §لوحة العميل).
//
// **الأوضاع الثلاثة:**
//   ar     — كل شيء عربي، dir=rtl
//   mixed  — التقنيات (queue, render, tenant…) بالإنجليزية،
//            الحالات والواجهة بالعربية. dir=rtl. الأنسب لمصممي السوشيال
//            العرب الذين يقولون «الـ queue» فعلاً
//   en     — كل شيء إنجليزي، dir=ltr
//
// **الحفظ:** localStorage الآن. المرحلة 4: `brandKit.locale` فتُحفظ مع
// هوية العميل ويراها كل مستخدميه (سُجِّل في PHASES-dashboards.md).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import ar from './ar.json';
import en from './en.json';
import mixed from './mixed.json';

export type Locale = 'ar' | 'mixed' | 'en';

const DICTS: Record<Locale, typeof ar> = { ar, mixed, en };
const STORAGE_KEY = 'pfmk.dashboard.locale';
const DEFAULT_LOCALE: Locale = 'ar';

// dir/lang لكل وضع — يُطبَّق على <html> عبر effect
const DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  mixed: 'rtl',
  en: 'ltr',
};
const HTML_LANG: Record<Locale, string> = {
  ar: 'ar',
  mixed: 'ar', // مختلطة تظل عربية الأصل لأغراض hyphenation و font-fallback
  en: 'en',
};

// ── سياق ──────────────────────────────────────────────

interface LocaleContext {
  readonly locale: Locale;
  setLocale(next: Locale): void;
  t(key: string, params?: Record<string, string | number>): string;
}

const Ctx = createContext<LocaleContext | null>(null);

// ── الوصول لـsafe في SSR ─────────────────────────────

function readInitial(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'ar' || stored === 'mixed' || stored === 'en'
    ? stored
    : DEFAULT_LOCALE;
}

// ── فك مفتاح متداخل: "client.jobRunningPct" → object walk ─

function lookup(
  dict: unknown,
  key: string
): string | null {
  const parts = key.split('.');
  let node: unknown = dict;
  for (const p of parts) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[p];
  }
  return typeof node === 'string' ? node : null;
}

function interpolate(
  s: string,
  params?: Record<string, string | number>
): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    Object.prototype.hasOwnProperty.call(params, k) ? String(params[k]) : `{${k}}`
  );
}

// ── Provider + hook ──────────────────────────────────

export function LocaleProvider({ children }: { children: ReactNode }): JSX.Element {
  // نبدأ من الافتراضي دائماً على الخادم (لتفادي hydration mismatch)،
  // ثم effect يُحدّث من localStorage بعد mount.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const initial = readInitial();
    if (initial !== locale) setLocaleState(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dir = DIRECTION[locale];
    document.documentElement.lang = HTML_LANG[locale];
  }, [locale]);

  const setLocale = (next: Locale): void => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* بلا حفظ إن رفض المتصفح */
    }
  };

  const value = useMemo<LocaleContext>(() => {
    const dict = DICTS[locale];
    return {
      locale,
      setLocale,
      t: (key, params) => {
        const found = lookup(dict, key);
        if (found !== null) return interpolate(found, params);
        // fallback على العربية إن غاب المفتاح في الوضع الحالي
        const fb = lookup(ar, key);
        return fb !== null ? interpolate(fb, params) : key;
      },
    };
  }, [locale]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLocale خارج LocaleProvider');
  return v;
}
