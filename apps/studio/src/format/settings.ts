'use client';

// إعدادات المستخدم — نمط الأرقام والاتجاه.
//
// **مصدر واحد للحقيقة:** بعد اكتمال endpoint المستخدم (A9 · docs/17)،
// هذه القيم تأتي من `GET /v1/tenant.user`. حتى ذلك، localStorage
// كبديل، تماماً كما اللغة (`pfmk.studio.locale`).
//
// **ADR-011 · L-49:** الإعداد لكل موظف، لا لكل هوية.

import { useEffect, useState } from 'react';
import type { DigitStyle } from './digits';

const KEY = 'pfmk.studio.digits';
const DEFAULT: DigitStyle = 'latin';

function isDigitStyle(v: string | null): v is DigitStyle {
  return v === 'latin' || v === 'arabic-indic';
}

export function readDigitStyle(): DigitStyle {
  if (typeof window === 'undefined') return DEFAULT;
  const url = new URLSearchParams(window.location.search).get('digits');
  if (isDigitStyle(url)) return url;
  const stored = window.localStorage.getItem(KEY);
  return isDigitStyle(stored) ? stored : DEFAULT;
}

export function writeDigitStyle(style: DigitStyle): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, style);
  } catch {
    /* ignore */
  }
}

export function useDigitStyle(): {
  readonly style: DigitStyle;
  set(next: DigitStyle): void;
} {
  const [style, setStyle] = useState<DigitStyle>(DEFAULT);

  useEffect(() => {
    setStyle(readDigitStyle());
  }, []);

  const set = (next: DigitStyle): void => {
    setStyle(next);
    writeDigitStyle(next);
  };

  return { style, set };
}
