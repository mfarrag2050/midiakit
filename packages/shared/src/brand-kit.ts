// BrandKit — مطابق حرفياً لمخطط docs/03-brand-kit-spec.md.
// كل قيمة كانت مثبتة داخل دوال الرسم في reference/aa-media-kit.html
// تصبح مسحوبة من هنا. لا اختراع قيمة.

// ── الخطوط ─────────────────────────────────────────────

export type FontSource = 'custom' | 'builtin';

export type KashidaMethod = 'tatweel' | 'variableAxis' | 'glyphVariants';

export interface FontCaps {
  readonly kashida: boolean;
  readonly kashidaMethod: KashidaMethod;
  readonly variableAxes: readonly string[];
  readonly diacriticsSafe: boolean;
}

export interface FontWeight {
  readonly url: string;
  readonly value: number;
}

export interface FontFamily {
  readonly family: string;
  readonly source: FontSource;
  readonly licenseAck: boolean;
  readonly weights: {
    readonly light: FontWeight;
    readonly regular: FontWeight;
    readonly bold: FontWeight;
  };
}

export interface BrandFonts {
  readonly primary: FontFamily;
  readonly fallback: string;
  readonly capabilities: FontCaps;
}

// ── الألوان ────────────────────────────────────────────

export interface BrandColors {
  readonly text: string;
  readonly accent: string;
  readonly urgentBadge: string;
  readonly urgentBg: string;
  readonly urgentBgTint: string;
  readonly locationBadge: string;
  readonly surface: string;
  readonly placeholder: readonly [string, string];
}

// ── الشعار والعلامة المائية ────────────────────────────

export type LogoAnchor =
  | 'bottom-left'
  | 'bottom-right'
  | 'top-left'
  | 'top-right';

export interface BrandWatermark {
  readonly enabled: boolean;
  readonly scale: number;
  readonly offsetX: number;
  readonly opacity: number;
  readonly tint: string; // reference like "colors.urgentBgTint" — يُحلّ عبر resolve()
}

export interface BrandLogo {
  readonly url: string;
  readonly size: number;
  readonly margin: number;
  readonly position: LogoAnchor;
  readonly watermark: BrandWatermark;
}

// ── الطباعة ────────────────────────────────────────────

export interface TypographyHeadline {
  readonly max: number;
  readonly min: number;
  readonly lineHeight: number;
  readonly boxWidth: number;
}

/**
 * أسلوب اللف. الافتراضي `uniform` — كل الأسطر تستهدف نفس العرض
 * (`boxWidth`) وتُختار برمجة ديناميكية تعاقب التفاوت والملء الضعيف.
 * القرار طباعي: الصحافة العربية المحترفة تفضّل أسطراً متقاربة الطول
 * لا نمطاً هرمياً متذبذباً. `alternating` نمط موروث من الأداة القديمة
 * (نمط هرمي بـ `shortLineRatio`)؛ يبقى للتوافق فقط ولمن أراده صراحةً.
 */
export type WrapMode = 'uniform' | 'alternating';

export interface TypographyBreaking {
  readonly max: number;
  readonly min: number;
  readonly lineHeight: number;
  readonly boxWidth: number;
  readonly shortLineRatio: number;
  readonly maxLines: number;
  /** أدنى عدد أسطر مقبول (يمنع سطراً واحداً «هابطاً» في العنوان الرئيسي). */
  readonly minLines: number;
  /**
   * العدد المفضّل من الأسطر. عند تعدّد الحلول النظيفة عند نفس حجم الخط،
   * يُختار الأقرب إلى هذا العدد. لا يُلزم — يُوجّه فقط.
   */
  readonly preferredLines: number;
  /**
   * الحدّ الأدنى للمقروئية **كنسبة من عرض القماش (Canvas)** لا رقم مطلق.
   * الفكرة: يتكيّف مع مقاسات المخرجات المختلفة. عند 1080px بمعامل 0.045
   * = 48.6px. القاعدة تُطبَّق فقط كأرضية صلبة عند فشل كل الخيارات؛
   * الاختيار الرئيسي يفضّل الملء العالي حتى مع خط أصغر بقليل.
   */
  readonly readableMinRatio: number;
  /**
   * الملء المستهدف — نسبة من `boxWidth`. الحلّ الذي يبلغه بأي `fs` ضمن
   * النطاق الآمن يفوز على حلّ بخط أكبر وملء أدنى. مبرّر: فرق 6px بين
   * حجمين لا يُرى، لكن فرق 15% في الملء يُرى بوضوح.
   */
  readonly targetFill: number;
  readonly wrapMode: WrapMode;
  /**
   * **نطاق حجم الخط المفضّل** كنسبتين من عرض القماش (min, max).
   * على 1080px: `[0.065, 0.085]` = 70-92px — النطاق الصحفي القياسي
   * لبطاقة العاجل العربية.
   *
   * الأولوية في `wrapOptimal` (مع `preferLargestFs`):
   *   1) البحث **داخل هذا النطاق** أولاً عن حلٍّ مقبول.
   *   2) الفشل ⇒ التراجع إلى `[minFont, maxFont]` ككل.
   *
   * `readableMinRatio` يبقى أرضية طوارئ (اختصاراً لمقروئية دنيا)،
   * لا نطاقاً مفضّلاً. الحدّ الأعلى `max` (نموذجياً 80) يقيّد ceiling
   * فعلياً حتى لو أعطى النسبة العليا رقماً أكبر.
   */
  readonly headlineFsRatio: readonly [number, number];
  /**
   * نطاق عرض الصندوق كنسبتين من عرض القماش (min, max).
   * عند التمكين، `wrapOptimal` يستكشف عدة عروض داخل النطاق ويختار
   * التركيبة (fs, boxWidth, k) الأفضل بدلاً من ثبات boxWidth واحد.
   *
   * السبب المعماري: كشيدة أداة ضبط دقيق (آخر 5-15%)؛ إن ثبت boxWidth
   * قد يخلق فجوة تفوق سعة الكشيدة (56-112px قبالة عجز 300px). عرض
   * أضيق يعطي ملء طبيعي أعلى ⇒ الكشيدة تُكمل، لا تسدّ فراغاً هائلاً.
   *
   * افتراضي `[0.72, 0.88]` — على 1080px يعطي 778 إلى 950px.
   * الحد الأعلى قريب من boxWidth الأصلي (900 = 83% × 1080).
   */
  readonly boxWidthRange: readonly [number, number];
}

export interface TypographyKicker {
  readonly max: number;
  readonly min: number;
  readonly weight: number;
  readonly boxWidth: number;
  readonly gapBelow: number;
}

export interface TypographyTitle3L {
  readonly max: number;
  readonly min: number;
  /**
   * title3l للعناوين القصيرة داخل card_kicker — عادةً 1-2 سطر. المحرك
   * يورّث knobs التخطيط الأخرى من `breaking`، لكن `minLines/preferredLines`
   * يجب أن تختلف: قبول سطر واحد، وتفضيل 1-2 لا 3.
   */
  readonly minLines: number;
  readonly preferredLines: number;
}

export interface TypographySource {
  readonly size: number;
  readonly weight: number;
}

export interface TypographyReelTitle {
  readonly max: number;
  readonly min: number;
  readonly maxLines: number;
  readonly boxInset: number;
  readonly verticalAnchor: number;
  // ── حقول تخطيط headline (تتوافق مع TypographyBreaking) ──────
  // مطلوبة كي يعمل `renderFrame` على قوالب الريلز — الحقول الأصلية
  // (max, min, maxLines, boxInset, verticalAnchor) وحدها لا تكفي.
  readonly lineHeight: number;
  readonly boxWidth: number;
  readonly shortLineRatio: number;
  readonly minLines: number;
  readonly preferredLines: number;
  readonly readableMinRatio: number;
  readonly headlineFsRatio: readonly [number, number];
  readonly boxWidthRange: readonly [number, number];
}

export interface TypographyAccentBar {
  readonly height: number;
  readonly minWidth: number;
  readonly maxWidth: number;
}

export type LineHeightMode = 'dynamic' | 'fixed';

export type JustifyMode = 'none' | 'space' | 'kashida' | 'hybrid';

export interface JustifyConfig {
  readonly mode: JustifyMode;
  readonly maxStretchPerSite: number;
  readonly maxSitesPerWord: number;
  readonly minLineFill: number;
  readonly lastLine: 'natural' | 'justified';
}

export type SemanticBreakUseModel = 'never' | 'onAmbiguity' | 'always';

export interface SemanticBreaksConfig {
  readonly enabled: boolean;
  readonly useModel: SemanticBreakUseModel;
}

export type DiacriticsMode = 'full' | 'partial';

export interface DiacriticsConfig {
  readonly enabled: boolean;
  readonly mode: DiacriticsMode;
}

export type NumeralStyle = 'arabic' | 'latin';

export interface BidiConfig {
  readonly enabled: boolean;
  readonly numerals: NumeralStyle;
}

export interface BrandTypography {
  readonly headline: TypographyHeadline;
  readonly breaking: TypographyBreaking;
  readonly kicker: TypographyKicker;
  readonly title3l: TypographyTitle3L;
  readonly source: TypographySource;
  readonly reelTitle: TypographyReelTitle;
  readonly accentBar: TypographyAccentBar;
  readonly lineHeightMode: LineHeightMode;
  readonly justify: JustifyConfig;
  readonly semanticBreaks: SemanticBreaksConfig;
  readonly diacritics: DiacriticsConfig;
  readonly bidi: BidiConfig;
}

// ── الشارات ────────────────────────────────────────────

export interface UrgentBadge {
  readonly label: string;
  readonly fontSize: number;
  readonly height: number;
  readonly paddingX: number;
  readonly radius: number;
  readonly fill: string;
  readonly textColor: string;
}

export type BadgeAnchor = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface LocationBadge {
  readonly fontSize: number;
  readonly height: number;
  readonly paddingX: number;
  readonly radius: number;
  readonly fill: string;
  readonly textColor: string;
  readonly margin: { readonly x: number; readonly y: number };
  readonly anchor: BadgeAnchor;
}

export interface BrandBadges {
  readonly urgent: UrgentBadge;
  readonly location: LocationBadge;
}

// ── التدرّج والظلال والهوامش والحركة والمخرجات ────────

export type GradientStop = readonly [number, number];

export interface BrandGradient {
  readonly defaultOpacity: number;
  readonly defaultReach: number;
  readonly shape: readonly GradientStop[];
  readonly band: readonly GradientStop[];
}

export interface ShadowConfig {
  readonly color: string;
  readonly blur: number;
  readonly offsetY: number;
}

export interface BrandShadows {
  readonly reelTitle: ShadowConfig;
}

export interface BrandMargins {
  readonly contentRight: number;
  readonly breakingBaseline: number;
  readonly sourceBaseline: number;
  readonly badgeGap: number;
  readonly cardTopPortrait: number;
  readonly cardBottomS01: number;
}

export interface BrandMotion {
  readonly segmentMin: number;
  readonly segmentMax: number;
  readonly segmentWordBase: number;
  readonly segmentWordStep: number;
  readonly crossfade: number;
  readonly reelCrossfade: number;
  readonly titleFadeIn: number;
  readonly titleFadeOut: number;
  readonly badgeDelay: number;
  readonly badgeFade: number;
  readonly lineStagger: number;
  readonly lineFade: number;
  readonly outro: number;
  readonly badgePulse: number;
}

export interface OutputSize {
  readonly w: number;
  readonly h: number;
}

export interface BrandOutputs {
  readonly x: OutputSize;
  readonly instagram: OutputSize;
  readonly feed: OutputSize;
  readonly reel: OutputSize;
}

export interface BrandAudioTrack {
  readonly url: string;
  readonly label: string;
  readonly licenseAck: boolean;
}

// ── الموضع في الهوية (Placement) ───────────────────────
// **مبدأ (2026-09-02):** الهوية تُحدِّد **أين** توضع العناصر — القالب
// يحدّد **أيّها** يظهر. عند التعارض: الهوية تفوز، إلا إن حمل القالب
// قيداً صريحاً (مثال: قالب يفرض الإسناد تحت العنوان مباشرة).
//
// **التطبيق التدريجي:** الطور الحالي (2026-09-02) يربط الإسناد فقط
// بهذه البنية. الشعار والشارة والمصدر ينضمّون في مهمة تالية — لكن
// المخطط مصمَّم ليشملهم من الآن لتفادي إعادة تصميم لاحقة.

export type PlacementAnchor =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left'            | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right';

export interface PlacementSpec {
  readonly anchor: PlacementAnchor;
  /** إزاحة بكسل من نقطة الحاوية عند الأنكور. الاتجاه بحسب الأنكور:
   *  bottom-* يُضاف عمودياً للأعلى (سلبي)، top-* للأسفل (موجب)، إلخ.
   *  الافتراضي الآمن: `{ x: 40, y: 40 }` من الحواف. */
  readonly offset: { readonly x: number; readonly y: number };
}

/**
 * كل العناصر المموضَعة عالمياً في الهوية. `attribution` مطبَّق الآن،
 * الباقي مُعرَّف في المخطط ويُطبَّق مرحلياً. عند غياب مفتاح: fallback
 * إلى السلوك السابق (brand.logo.position لـlogo، إلخ).
 */
export interface BrandPlacement {
  readonly logo?: PlacementSpec;
  readonly badge?: PlacementSpec;
  readonly attribution?: PlacementSpec;
  readonly source?: PlacementSpec;
}

// ── الأصول (Assets pin) ────────────────────────────────
// راجع docs/13-asset-lifecycle.md.
// **قاعدة:** تحديث الإصدار قرار العميل، لا تلقائي. تحديث خفي يغيّر
// عرض حرف = كسر كسور السطور في مخرجات قائمة.

export interface BrandAssetsPin {
  /** إصدار مجلد `mediakit-assets/YYYY.MM/` الذي يستهلكه هذا العميل. */
  readonly version: string;
  /**
   * تحديث تلقائي إلى `latest` عند إصدار جديد. الافتراضي `false`.
   * `true` مقصور على الحسابات التجريبية.
   */
  readonly autoUpdate: boolean;
}

// ── الإسناد (Attribution) ──────────────────────────────
// راجع docs/03 §attribution و ATTRIBUTIONS.md §شعارات المنصات.
// **قاعدة قانونية:** لا شعار منصة يُشحن كصورة داخل `packages/*`.
// حين logoMode='official'، الشعار يُرسم من مسار SVG في `simple-icons`
// (CC0)، بلون brandKit، ويشترط licenseAck=true من العميل.

export type PlatformKey =
  | 'tiktok'
  | 'x'
  | 'instagram'
  | 'youtube'
  | 'telegram'
  | 'facebook';

/**
 * سلوك عرض شعار المنصة:
 *   • none     — نصّ فقط، لا أيقونة. الأنظف قانونياً. **الافتراضي.**
 *   • generic  — أيقونة محايدة (شكل هندسي بلون brandKit) بلا علامة تجارية.
 *   • official — الشعار الرسمي من simple-icons، يشترط licenseAck.
 */
export type PlatformLogoMode = 'none' | 'generic' | 'official';

export type PlatformNameStyle = 'ar' | 'latin';

/** إقرار قانوني لكل منصة عند اختيار logoMode='official'. */
export interface AttributionLogoAck {
  /**
   * إقرار العميل بأنه يملك حقّ عرض الشعار في هذا المنتج التجاري.
   * المحرك يرفض الرسم إن كان false مع logoMode='official'.
   */
  readonly licenseAck: boolean;
  /** اسم صاحب القرار داخل الوكالة (للسجل، غير مستعمل في الرسم). */
  readonly ackBy: string;
  /** تاريخ الإقرار ISO 8601 (للسجل). */
  readonly ackAt: string;
}

export type AttributionLogoAcks = {
  readonly [K in PlatformKey]: AttributionLogoAck;
};

export interface BrandAttribution {
  readonly logoMode: PlatformLogoMode;
  readonly platformNameStyle: PlatformNameStyle;
  /** فاصل بين اسم المنصة والمقبض (« · » افتراضاً). */
  readonly separator: string;
  /** حجم الأيقونة بالبكسل عند canvas 1080. */
  readonly iconSize: number;
  readonly logoAcks: AttributionLogoAcks;
}

// ── BrandKit المكتمل ───────────────────────────────────

export type Direction = 'rtl' | 'ltr';

export interface BrandKit {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly direction: Direction;
  readonly locale: string;
  readonly fonts: BrandFonts;
  readonly colors: BrandColors;
  readonly logo: BrandLogo;
  readonly typography: BrandTypography;
  readonly badges: BrandBadges;
  readonly gradient: BrandGradient;
  readonly shadows: BrandShadows;
  readonly margins: BrandMargins;
  readonly motion: BrandMotion;
  readonly outputs: BrandOutputs;
  readonly audio: readonly BrandAudioTrack[];
  readonly attribution: BrandAttribution;
  /**
   * تجميد إصدار مستودع الأصول (docs/13). اختياري في النموذج حالياً —
   * يُنفَّذ فعلياً مع بنية `mediakit-assets/` في المرحلة 4. غيابه في
   * الاختبارات ⇒ ضمنياً `latest`.
   */
  readonly assets?: BrandAssetsPin;
  /**
   * مواضع العناصر — نمط موحّد (docs/03 §placement). الهوية تحدّد أين،
   * القالب يحدّد أيّها. مطبَّق حالياً على attribution؛ الشعار والشارة
   * والمصدر ينضمّون تدريجياً.
   */
  readonly placement?: BrandPlacement;
}
