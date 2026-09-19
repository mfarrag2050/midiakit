// ٤٣٠ §٣ · قراءةُ اختيار الخطّ من `BrandKit.config` كدالّةٍ خالصةٍ قابلة
// للاختبار. المنطقُ كان مبنيّاً داخل `load()` في محرّر الهويّة —
// استخرجناه هنا لِيُوَثَّق بضمان تراجعٍ (regression) أنّ الهويّاتِ التي
// رفعت خطّاً قبل معرِض ٤٣٠ لا يتغيّر مظهرُها.
//
// **البدائل الثلاثة:**
//   · `{ kind: 'builtin', family }` — `source === 'builtin'` وعائلةٌ في
//     `BUILTIN_FONT_FAMILIES`.
//   · `{ kind: 'asset', id }` — أوّلاً `weights.regular.assetId` أيّاً كان
//     `source` (الهويّاتُ المرفوعةُ قبل ٤٣٠ قد تحمل `source='custom'` أو
//     `'external'` أو تفتقر إلى `source` أصلاً).
//   · `{ kind: 'unset' }` — لا شيء منهما.

import { BUILTIN_FONT_FAMILIES } from './builtin-fonts';

export type FontChoice =
  | { readonly kind: 'unset' }
  | { readonly kind: 'builtin'; readonly family: string }
  | { readonly kind: 'asset'; readonly id: string };

function pickString(
  obj: unknown,
  ...path: readonly string[]
): string | undefined {
  let cur: unknown = obj;
  for (const p of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === 'string' && cur.length > 0 ? cur : undefined;
}

export function interpretBrandFont(config: unknown): FontChoice {
  const source = pickString(config, 'fonts', 'primary', 'source');
  const family = pickString(config, 'fonts', 'primary', 'family');
  const assetId = pickString(
    config,
    'fonts',
    'primary',
    'weights',
    'regular',
    'assetId'
  );
  if (
    source === 'builtin' &&
    family &&
    BUILTIN_FONT_FAMILIES.includes(family)
  ) {
    return { kind: 'builtin', family };
  }
  if (assetId) return { kind: 'asset', id: assetId };
  return { kind: 'unset' };
}
