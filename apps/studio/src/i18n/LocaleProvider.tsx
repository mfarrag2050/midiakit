'use client';

// i18n — نظام لغات خفيف بلا مكتبة، نمط `apps/dashboard/src/i18n/`
// كما اقتضت docs/17 §4.1 (S3).
//
// **الأوضاع الثلاثة:**
//   ar     — عربية كاملة، dir=rtl
//   mixed  — L-24: الخلط على مستوى الوحدة الدلالية المستقلة لا
//            داخل الجملة. مسمّى قائمة/زرّ/عمود بالإنجليزية = مقبول.
//            «مهمتك في الـ render» = مرفوض.
//   en     — إنجليزية كاملة، dir=ltr
//
// **الحفظ:** `users.locale` (ADR-011 · L-49) — كل موظف يختار لغته.
// localStorage الآن، تنقل إلى endpoint المستخدم في S6+A9.
//
// SSR-safe: نبدأ من DEFAULT، effect يستبدل بعد mount (لا hydration mismatch).

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
const STORAGE_KEY = 'pfmk.studio.locale';
const DEFAULT_LOCALE: Locale = 'ar';

const DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  mixed: 'rtl',
  en: 'ltr',
};
const HTML_LANG: Record<Locale, string> = {
  ar: 'ar',
  mixed: 'ar', // مختلطة عربية الأصل — fallback fonts + hyphenation
  en: 'en',
};

interface LocaleContext {
  readonly locale: Locale;
  setLocale(next: Locale): void;
  t(key: string, params?: Record<string, string | number>): string;
}

const Ctx = createContext<LocaleContext | null>(null);

function isLocale(v: string | null): v is Locale {
  return v === 'ar' || v === 'mixed' || v === 'en';
}

function readInitial(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  // `?locale=X` يتخطى المخزَّن — مفيد للقطات والاختبار الآلي.
  const fromUrl = new URLSearchParams(window.location.search).get('locale');
  if (isLocale(fromUrl)) return fromUrl;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

function lookup(dict: unknown, key: string): string | null {
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

export function LocaleProvider({ children }: { children: ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const initial = readInitial();
    if (initial !== locale) setLocaleState(initial);
    // نتجاهل تبعية locale — نريد قراءة أوّلية فقط
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
