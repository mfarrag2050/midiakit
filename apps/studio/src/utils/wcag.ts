// WCAG contrast ratio على لونَي hex.
//
// **مصدر واحد للأرقام (L-73):** الصيغة نفسها المستعملة في
// `mk`:`scripts/verify-text-contrast.mjs` (`aa6ade2` · 2026-09-11).
// هناك تُطبَّق على بكسل مُقنَّع فوق خلفيّة مرندَرة · هنا تُطبَّق على
// لونَي hex من الإعدادات.
//
// **اقتراح لـ`mk`:** حين يُتاح لك، اسحب الصيغة من فاحصك إلى موضع
// مشترك (مثلاً `packages/shared/src/wcag.ts` بحسب سياستك على
// `packages/shared`) واستعمل نفس الدالة هنا · حتّى ذلك الحين، هذا
// الملفّ نظير حرفيّ.
//
// الصيغة (WCAG 2.x §1.4.3):
//   - relative luminance L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin
//     بعد تحويل sRGB→linear: c ≤ 0.03928 ⇒ c/12.92 · وإلاّ ((c+0.055)/1.055)^2.4
//   - contrast ratio = (L_bright + 0.05) / (L_dark + 0.05) · ∈ [1, 21]

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function parseHex(hex: string): [number, number, number] | null {
  if (typeof hex !== 'string') return null;
  const trimmed = hex.trim();
  const m = HEX_RE.exec(trimmed);
  if (!m || !m[1]) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return (
    0.2126 * srgbToLinear(r) +
    0.7152 * srgbToLinear(g) +
    0.0722 * srgbToLinear(b)
  );
}

/**
 * WCAG contrast ratio بين لونَي hex بصيغة `#RRGGBB`.
 * يعيد رقماً في [1, 21] · أو `null` إن كان أحد اللونَين غير صالح.
 * غير صالح: طول مختلف · حرف خارج hex · فراغ · null · غير نصّ.
 */
export function contrastRatio(hexA: string, hexB: string): number | null {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return null;
  const la = luminance(a);
  const lb = luminance(b);
  const bright = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (bright + 0.05) / (dark + 0.05);
}

/**
 * حدّ WCAG AA للنصّ العاديّ. حدّاً واحداً يستعمله كامل التطبيق
 * لتَجَنُّب أرقام موازية.
 */
export const WCAG_AA_NORMAL = 4.5;

/**
 * تنسيق للعرض · `3.20` أو `12.14`. رقمان بعد الفاصلة، لا زوائد.
 */
export function formatContrast(ratio: number): string {
  return ratio.toFixed(2);
}
