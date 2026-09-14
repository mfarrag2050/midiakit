// 141-FONT-IDENTITY-BY-ASSET · الـshim الذي يشتقّ اسماً فريداً لتسجيل
// الخطّ في `FontLibrary`، مستقلّاً عن اسم العائلة العرضيّ.
//
// **العطب الذي يُغلقه** (مُثبَت في 140):
//   `api-worker.ts:185` كان `FontLibrary.use(fa.family, [path])` — وكالتان
//   بنفس اسم عائلة (`Cairo` شائع) تتصادمان بصمت: فيديو job A يُصيَّر
//   بخطّ job B إن قاطعت مقاطعةً حرجة (15/20 إطار في اختبار concurrent).
//
// **الحلّ**: `FontLibrary.use(deriveFontIdentity(fa), [path])`. الاسم
// المشتقّ فريد لكل أصل — بلا تصادم بنيويّاً · لا بين مستأجرَين ولا داخل
// مستأجر واحد رفع نسختَين.
//
// **موضع واحد**: هذا الملفّ الوحيد يحمل منطق الاشتقاق. أيّ نداء آخر يستورده.
//
// **لا سقوط صامت**: بلا `family` ولا `assetId` ⇒ يرمي `FONT_IDENTITY_MISSING`.
// السبب: الحالة الوحيدة التي نحتاج فيها اسماً هي حالة نعرف فيها **أيّ خطّ
// نستعمل**. غياب الطرفَين يعني brand kit مكسور · الرسم يجب أن يفشل بصوت.
//
// **كيف يموت هذا الـshim**: حين ينفّذ `mk` خطوة `deriveFamily` داخل
// `packages/engine/src/brand/resolve.ts` (تكتب على `brand.fonts.primary.family`
// اسمَ runtime مشتقّاً)، `api-worker.ts` سيقرأ `brand.fonts.primary.family`
// مباشرة بلا استدعاء `deriveFontIdentity`. عندئذٍ:
//   • **احذف كل مواضع النداء** في api-worker.ts + cli.ts.
//   • **احذف هذا الملفّ**.
//   • **احذف اختبار guard** في `font-isolation.test.ts` (يبقى witness).
// لا تُبقِ المسارَين معاً — مصدرا حقيقة يتباعدان · وهذا أسوأ من العطب الأصليّ.

/**
 * يشتقّ اسم عائلة runtime لتسجيله في `FontLibrary`.
 *
 * @param fa - `assetId` اختياريّ · `family` هو اسم العائلة العرضيّ.
 * @returns اسم فريد:
 *   • `mk-<assetId>` إن وُجد `assetId` (خطّ مرفوع من العميل).
 *   • `mk-builtin-<slug>` إن غاب `assetId` ووُجد `family` (خطّ مدمج).
 * @throws Error مع كود `FONT_IDENTITY_MISSING` إن غاب الاثنان.
 */
export function deriveFontIdentity(fa: { family?: string; assetId?: string }): string {
  if (fa.assetId) return `mk-${fa.assetId}`;
  if (fa.family) return `mk-builtin-${slug(fa.family)}`;
  // لا سقوط صامت (القاعدة 14 · L-59): brand kit بلا هويّة خطّ = خطأ رسم
  // فوريّ يُبلَغ بصوت، لا مربّعات فارغة في مخرَج العميل.
  const err = new Error('FONT_IDENTITY_MISSING: fa يحمل لا family ولا assetId');
  (err as Error & { code: string }).code = 'FONT_IDENTITY_MISSING';
  throw err;
}

/** يحوّل اسم عائلة عرضيّ إلى معرّف slug صالح لـFontLibrary. */
function slug(family: string): string {
  return family
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * يُنتج نسخةً من `brand` باستبدال `brand.fonts.primary.family` باسم
 * runtime مشتقّ (وباقي family fields في `byLocale.*` إن وُجدت).
 *
 * **لماذا نحتاجه**: engine يقرأ `brand.fonts.primary.family` كنصّ مباشر
 * لبناء `ctx.font`. إن بقي = اسم العرض (`Cairo`)، fillText يبحث عن هذا
 * الاسم في FontLibrary · قد يجد خطّ مستأجر آخر مسجَّلاً بنفس الاسم.
 * نستبدل بـruntime المشتقّ فيتطابق مع ما سجّله `api-worker` عبر
 * `FontLibrary.use(runtime, [path])`.
 *
 * **هذا شقّ آخر من الـshim** — يموت مع أخيه حين ينفّذ mk deriveFamily
 * داخل resolveBrand: عندئذٍ brand يأتي مُشتقّاً منذ الإدخال · لا حاجة
 * لهذه الدالّة. راجع رأس الملفّ لكيفيّة الحذف.
 *
 * @throws FONT_IDENTITY_MISSING إن primary بلا assetId ولا family.
 */
export function applyRuntimeFontIdentity<T extends {
  fonts?: {
    primary?: { family?: string; assetId?: string };
    byLocale?: Record<string, { family?: string; assetId?: string } | undefined>;
  };
}>(brand: T): T {
  if (!brand.fonts?.primary) return brand;
  const primaryRuntime = deriveFontIdentity(brand.fonts.primary);
  const nextByLocale: Record<string, unknown> = {};
  if (brand.fonts.byLocale) {
    for (const [k, fam] of Object.entries(brand.fonts.byLocale)) {
      if (!fam) continue;
      nextByLocale[k] = { ...fam, family: deriveFontIdentity(fam) };
    }
  }
  return {
    ...brand,
    fonts: {
      ...brand.fonts,
      primary: { ...brand.fonts.primary, family: primaryRuntime },
      ...(brand.fonts.byLocale ? { byLocale: nextByLocale } : {}),
    },
  } as T;
}

/**
 * الاتجاه المعاكس — يعيد `family` إلى الاسم العرضيّ من `displayFamily`
 * (إن كان محفوظاً) أو من fallback map. يُستعمل عند تسليم snapshot إلى UI.
 *
 * ملاحظة: حالياً لا نحفظ `displayFamily` في `brand.fonts.primary` — الشكل
 * الحاليّ يستبدل `family` بـruntime فقط. **UI الحاليّة** لا تستهلك
 * `brand_snapshot.fonts.primary.family` صريحاً (لا أعرف · إن استهلكته
 * ستَرى `mk-<uuid>`). لهذا `stripRuntimeFontIdentity` يعرض runtime → اسم
 * عرضيّ إن أمكن استعادته من map · وإلّا يبقيه (خير من احتمال كسر).
 */
export function stripRuntimeFontIdentity<T extends {
  fonts?: { primary?: { family?: string; displayFamily?: string } };
}>(brand: T): T {
  const primary = brand.fonts?.primary;
  if (!primary?.family?.startsWith('mk-')) return brand;
  const display = primary.displayFamily;
  if (!display) return brand; // لا map · نبقي runtime · لا خطر
  return {
    ...brand,
    fonts: {
      ...brand.fonts,
      primary: { ...primary, family: display },
    },
  } as T;
}
