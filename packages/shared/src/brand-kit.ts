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

export interface TypographyBreaking {
  readonly max: number;
  readonly min: number;
  readonly lineHeight: number;
  readonly boxWidth: number;
  readonly shortLineRatio: number;
  readonly maxLines: number;
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
}
