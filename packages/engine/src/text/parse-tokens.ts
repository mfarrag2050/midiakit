// نقل مباشر من reference/aa-media-kit.html §cvParseTokens
// (INVENTORY.md — الأسطر 1769–1783 بعد تنظيف المرحلة 0).
// المحرك خالص: لا ctx، لا حالة عامة.

import type { Token } from '@pf-mediakit/shared';

/**
 * يفسّر النص إلى قائمة رموز.
 *   `*عريض*`  ← bold = true
 *   `_تمييز_` ← accent = true
 *   `\n`      ← فاصل سطر يدوي
 * المسافات المتتالية تُدمج، والفراغ يُقسّم إلى كلمات.
 */
export function parseTokens(text: string): Token[] {
  const tokens: Token[] = [];
  let bold = false;
  let accent = false;
  let cur = '';

  const flush = (): void => {
    cur
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => tokens.push({ text: w, bold, accent }));
    cur = '';
  };

  for (const ch of text) {
    if (ch === '*') {
      flush();
      bold = !bold;
    } else if (ch === '_') {
      flush();
      accent = !accent;
    } else if (ch === '\n') {
      flush();
      tokens.push({ br: true });
    } else {
      cur += ch;
    }
  }

  flush();
  return tokens;
}
