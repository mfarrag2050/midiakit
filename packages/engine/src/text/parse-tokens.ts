// نقل مباشر من reference/aa-media-kit.html §cvParseTokens
// (INVENTORY.md — الأسطر 1769–1783 بعد تنظيف المرحلة 0).
// المحرك خالص: لا ctx، لا حالة عامة.
//
// ٣٥٠ (2026-09-15): `_` كان يُعامل علامةَ accent مطلقاً، فيقسم كلّ
// `#hashtag_عربيّ` و`@user_handle`. الشرطة السفليّة هي الأسلوب المعياريّ
// لكتابة الهاشتاغات العربيّة (لا تحتمل الفراغ داخلها) والمقابض في X/Twitter.
// الآن: `_` داخل رمزٍ يبدأ بـ`#` أو `@` **جزءٌ من الرمز**، وخارج ذلك
// يبقى علامةَ accent كما كان (تعليمُ المحرِّر `_تمييز_`).

import type { Token } from '@pf-mediakit/shared';

/**
 * يفسّر النص إلى قائمة رموز.
 *   `*عريض*`        ← bold = true
 *   `_تمييز_`       ← accent = true (خارج #/@ فقط · ٣٥٠)
 *   `#hash_tag`     ← رمزٌ واحد؛ `_` جزءٌ من الرمز (٣٥٠)
 *   `@user_handle`  ← رمزٌ واحد؛ `_` جزءٌ من الرمز (٣٥٠)
 *   `\n`            ← فاصل سطر يدوي
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

  // ٣٥٠: هل نحن نتراكم داخل هاشتاغ/handle؟
  // الرمز الأخير في cur (ما بعد آخر مسافة) يبدأ بـ # أو @.
  const insideHashOrHandle = (): boolean => {
    const trailingMatch = /\S*$/.exec(cur);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    return trailing.startsWith('#') || trailing.startsWith('@');
  };

  for (const ch of text) {
    if (ch === '*') {
      flush();
      bold = !bold;
    } else if (ch === '_') {
      if (insideHashOrHandle()) {
        // ٣٥٠: _ داخل هاشتاغ/handle حرفيّ — لا يقلب accent.
        cur += '_';
      } else {
        flush();
        accent = !accent;
      }
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
