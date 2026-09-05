// locale — يحوّل brand حسب content.locale.
//
// **قرار معماري (2026-09-04):** بدل تمرير `locale` عبر كل طبقة، نُطبّق
// التحوّل مرة واحدة على brand في الأعلى. الطبقات تعمل كما هي — تقرأ
// من `brand` المُعدَّل. **صفر تغيير في الطبقات القائمة.**
//
// **ما يُبدّل حين locale=latin (L-49):**
//   1. `fonts.primary` → `fonts.byLocale.latin` إن وُجد
//   2. `capabilities.kashida = false` — لا معنى للتطويل لاتينياً
//   3. `semanticBreaks.enabled = false` — لا قواعد لكل لغة (docs/12 §رفض)
//   4. `diacritics.enabled = false` — لا تشكيل لاتيني
//   5. `direction` → ltr (يقرأه الرسم في placeholder ctx.direction)
//   6. `placement.*.anchor` → معكوس إن `placement.mirrorOnLTR = true`
//
// **الخالصة:** بلا تعديل on brand الأصلي. يعيد نسخة جديدة.

import type { BrandKit, Locale, PlacementSpec } from '@pf-mediakit/shared';
import { localeGroup, mirrorAnchorForLTR, fontForLocale } from '@pf-mediakit/shared';

/**
 * يبني brand مُعدَّل حسب لغة المحتوى. الاستدعاء تحت كل رندر (خالص —
 * يعتمد فقط على brand و locale).
 */
export function applyLocaleToBrand(brand: BrandKit, locale: Locale): BrandKit {
  const group = localeGroup(locale);

  // العربية = الخط الأصلي بلا تعديل — التوافق الرجعي.
  if (group === 'ar') {
    return brand;
  }

  // ── latin ───────────────────────────────────────────
  const latinFont = fontForLocale(brand.fonts, 'latin');
  const shouldMirror = brand.placement?.mirrorOnLTR === true;

  const mirroredPlacement = brand.placement
    ? {
        ...brand.placement,
        ...(brand.placement.logo        && { logo:        maybeMirror(brand.placement.logo,        shouldMirror)! }),
        ...(brand.placement.badge       && { badge:       maybeMirror(brand.placement.badge,       shouldMirror)! }),
        ...(brand.placement.attribution && { attribution: maybeMirror(brand.placement.attribution, shouldMirror)! }),
        ...(brand.placement.source      && { source:      maybeMirror(brand.placement.source,      shouldMirror)! }),
        ...(brand.placement.caption     && { caption:     maybeMirror(brand.placement.caption,     shouldMirror)! }),
      }
    : undefined;

  return {
    ...brand,
    fonts: {
      ...brand.fonts,
      primary: latinFont,
      // تعطيل قدرات الكشيدة صراحةً — استخدام fonts.capabilities في
      // بقية المحرك يظنّ أن الخط يدعمها.
      capabilities: {
        ...brand.fonts.capabilities,
        kashida: false,
      },
    },
    typography: {
      ...brand.typography,
      semanticBreaks: brand.typography.semanticBreaks
        ? { ...brand.typography.semanticBreaks, enabled: false }
        : brand.typography.semanticBreaks,
      diacritics: brand.typography.diacritics
        ? { ...brand.typography.diacritics, enabled: false }
        : brand.typography.diacritics,
      justify: brand.typography.justify
        ? { ...brand.typography.justify, mode: 'none' as const }
        : brand.typography.justify,
    },
    ...(mirroredPlacement && { placement: mirroredPlacement }),
    direction: 'ltr' as const,
  };
}

function maybeMirror(
  spec: PlacementSpec | undefined,
  shouldMirror: boolean
): PlacementSpec | undefined {
  if (!spec) return spec;
  if (!shouldMirror) return spec;
  return { ...spec, anchor: mirrorAnchorForLTR(spec.anchor, true) };
}
