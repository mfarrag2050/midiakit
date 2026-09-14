// dynamic-line-height — يحسب lineHeight من متريكات رأس الخطّ.
//
// **BASELINE-A · 2026-09-11 · L-73:** المصدر الوحيد للأعداد صار
// `brand.fonts.primary.metrics` (FontMetrics) — تُقاس مرّة عبر
// `pnpm measure-font <path.ttf>` وتُخزَّن في الهويّة. المحرك لا يستدعي
// `ctx.measureText` ولا يقرأ ملفّ خطّ وقت التشغيل. الأثر: الطرفان
// (Chrome + skia) يحسبان **نفس lineHeight** من نفس المدخلات ⇒ المطابقة
// خاصّية بنيويّة، لا تعويض ولا offset.
//
// **الشكل السابق (استُبدل):** كان يستدعي `ctx.measureText.actualBoundingBoxAscent`
// الذي يعيد em-box في Chrome و glyph-bbox في skia — قيَم مختلفة على
// الطرفَين لنفس المدخل. 20-PREVIEW-GAP قاس 11 قيمة Δlh فريدة على 30
// حالة. IMAGE-FIX يوضّح صنف العطب الأوسع (L-72). BASELINE-A يحلّه.
//
// **v1 tashkil معطَّل (قرار المالك 2026-09-10 · TASHKIL-OFF):** المسار
// البكسليّ (`measurePixelHeight` في `pixel-height.ts`) **يبقى في الكود
// لكن غير مستدعى من هنا**. عندما يعود التشكيل في v2، يحتاج مصدراً
// متطابقاً عبر المنصّات (مثلاً: قياس ذُروة كل مركّبة تشكيل بالوحدة
// المئوية للـem مرّة أخرى، وتخزينها في `brand.fonts.tashkilCaps` أو
// مشابه). **بقيّة معروفة — راجع تذكرة `TASHKIL-METRICS-UNIFY` (مقترَحة).**
//
// **الصيغة:**
//   raw = (metrics.ascent + metrics.descent) × fs / metrics.unitsPerEm
//   withPad = ceil(raw × (1 + safetyPad))
//   lineHeight = max(minLineHeight, withPad)
//
// **النقاء محفوظ:** الدالة تأخذ متريكات كأعداد وتعيد رقماً. لا ctx،
// لا font parsing، لا آثار جانبية. `check-engine-purity` يبقى أخضر —
// لم تُضَف تبعية على packages/engine.

import type { FontMetrics } from '@pf-mediakit/shared';

/**
 * lineHeight من متريكات رأس الخطّ — نفس النتيجة على Chrome و skia.
 *
 * @param metrics `brand.fonts.primary.metrics` — مقاسة مرّة عبر
 *   `pnpm measure-font`. الأعداد بوحدات em (كسور من `unitsPerEm`).
 * @param fs حجم الخطّ بالبكسل (كنقطة رياضية عائمة).
 * @param minLineHeight الحدّ الأدنى من `wrap.lineHeight` (fs × ratio).
 *   إن كان القياس أقلّ منه، نُبقيه — لا نضغط المسافة.
 * @param safetyPad إضافة نسبية لمنع التلاصق بين قمة ذيل السطر أعلى
 *   وأسفل ذيل السطر أسفل. الافتراضي 0.05 (5% من الارتفاع الأصليّ).
 */
export function measuredLineHeight(
  metrics: FontMetrics,
  fs: number,
  minLineHeight: number,
  safetyPad = 0.05
): number {
  const raw = ((metrics.ascent + metrics.descent) * fs) / metrics.unitsPerEm;
  if (raw <= 0) return minLineHeight;
  const withPad = Math.ceil(raw * (1 + safetyPad));
  return Math.max(minLineHeight, withPad);
}
