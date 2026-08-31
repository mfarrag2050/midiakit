// Template — بنية القالب. لا لون ولا خط داخله. مراجع `brand.*` تُحلّ
// وقت الرندر عبر `resolveBrand` في المحرك.
//
// المرجع: `docs/04-template-spec.md`.

// ── حقول الإدخال (fields) ─────────────────────────────

export type FieldType = 'text' | 'richtext' | 'image' | 'range' | 'medialist';

export interface TemplateFieldBase {
  readonly key: string;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly hint?: string;
}

export interface RichTextField extends TemplateFieldBase {
  readonly type: 'richtext';
  readonly wordRange?: readonly [number, number];
}

export interface TextField extends TemplateFieldBase {
  readonly type: 'text';
}

export interface ImageField extends TemplateFieldBase {
  readonly type: 'image';
}

export interface RangeField extends TemplateFieldBase {
  readonly type: 'range';
  readonly min: number;
  readonly max: number;
  readonly default?: number;
}

export interface MediaListField extends TemplateFieldBase {
  readonly type: 'medialist';
  readonly accepts?: readonly ('video' | 'image')[];
}

export type TemplateField =
  | TextField
  | RichTextField
  | ImageField
  | RangeField
  | MediaListField;

// ── الشروط والتراجع ───────────────────────────────────

/**
 * الشروط البسيطة التي يقبلها المفسّر (docs/04 §القواعد).
 * يمنع `onlyIf` تعقيداً بلا حاجة — كل شرط جديد يستلزم قراراً معمارياً.
 */
export type LayerOnlyIf = 'hasImage' | 'isSquare' | 'isPortrait';

// ── الطبقات (Layer union) ─────────────────────────────

interface LayerCommon {
  readonly onlyIf?: LayerOnlyIf;
  readonly fallback?: readonly Layer[];
}

export interface SolidLayer extends LayerCommon {
  readonly type: 'solid';
  /** لون: hex مباشر أو مرجع `brand.colors.*`. */
  readonly fill: string;
}

export interface ImageLayer extends LayerCommon {
  readonly type: 'image';
  /** مفتاح الحقل من `content` — إن غاب أو لم يوجد له asset يُشغَّل `fallback`. */
  readonly field?: string;
  readonly fit?: 'cover' | 'contain';
}

export type GradientDirection = 'top' | 'bottom' | 'center';

export interface GradientLayer extends LayerCommon {
  readonly type: 'gradient';
  readonly direction: GradientDirection;
  /** مرجع `brand.gradient` (اختياري — الافتراضي `brand.gradient`). */
  readonly from?: string;
  readonly opacity?: number;
  readonly reach?: number;
}

export type HeadlineAnchor =
  | 'centerLower'
  | 'bottom'
  | 'top'
  | 'middle'
  | 'below-kicker';
export type WrapMode = 'uniform' | 'alternating' | 'balanced';

export interface HeadlineLayer extends LayerCommon {
  readonly type: 'headline';
  /** مفتاح الحقل من `content`. */
  readonly field: string;
  readonly wrap: WrapMode;
  readonly align: 'right' | 'center';
  readonly anchor: HeadlineAnchor;
  /** لـ `centerLower` — نسبة من ارتفاع القماش (0.62 = تقريب النسبة الذهبية). */
  readonly verticalAnchor?: number;
  /** مرجع لتكوين طباعي في brand (مثل `brand.typography.breaking`). */
  readonly font: string;
  /** مرجع لتكوين التبرير (كشيدة) في brand — الافتراضي `brand.typography.justify`. */
  readonly justify?: string;
}

export interface BadgeLayer extends LayerCommon {
  readonly type: 'badge';
  /** مرجع `brand.badges.<key>`. */
  readonly use: string;
  /** اختياري: مفتاح حقل يستبدل `label` من الشارة (مثال: للموقع في الريلز). */
  readonly field?: string;
  readonly anchor: 'above-headline' | 'below-headline';
  /** مسافة بكسل — رقم أو مرجع brand (مثل `brand.margins.badgeGap`). */
  readonly gap: string | number;
}

export interface SourceLayer extends LayerCommon {
  readonly type: 'source';
  readonly field: string;
  readonly anchor: 'below-headline';
  /** المسافة كنسبة من `fs` — لا رقم مطلق (درس L-02). */
  readonly gapFsRatio: number;
  /** مرجع تكوين المصدر (مثل `brand.typography.source`). */
  readonly font: string;
}

export interface LogoLayer extends LayerCommon {
  readonly type: 'logo';
  readonly from?: string;
}

export interface WatermarkLayer extends LayerCommon {
  readonly type: 'watermark';
  readonly from: string;
}

export interface KickerLayer extends LayerCommon {
  readonly type: 'kicker';
  readonly field: string;
  readonly align?: 'right' | 'center';
  readonly font: string;
  /**
   * الموضع العمودي لخط الأساس ككسور من ارتفاع القماش (0.4 = 40% من
   * الأعلى — منطقة الكيكر التقليدية). افتراضي 0.40.
   */
  readonly verticalAnchor?: number;
}

export interface AccentLayer extends LayerCommon {
  readonly type: 'accent';
  readonly mode: 'span' | 'underline' | 'above-first-line';
  readonly color?: string;
  readonly target?: 'kicker' | 'headline';
}

export type Layer =
  | SolidLayer
  | ImageLayer
  | GradientLayer
  | HeadlineLayer
  | BadgeLayer
  | SourceLayer
  | LogoLayer
  | WatermarkLayer
  | KickerLayer
  | AccentLayer;

// ── القالب ─────────────────────────────────────────────

export type TemplateKind = 'static' | 'video';

// ── تحريك الفيديو ─────────────────────────────────────

export type EasingName =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeOutBack';

/**
 * حركة طبقة واحدة داخل الفيديو. `target` = نوع طبقة (`badge`,
 * `headline`, `source`, `logo`، …). `at` توقيت مطلق بالثواني؛ `after`
 * توقيت نسبي (بعد اكتمال طبقة أخرى) — أحدهما فقط.
 *
 * كل حقل زمني (fade, stagger) يقبل رقماً أو مرجع `brand.*` يُحلّ وقت
 * الرندر (مثل `brand.motion.lineFade`).
 */
export interface VideoAnimation {
  readonly target: string;
  readonly at?: number;
  readonly after?: string;
  readonly fade: number | string;
  readonly stagger?: number | string;
  readonly slideY?: number;
  /** نبضة قصيرة عند الظهور (مثل شارة العاجل). القيمة من `brand.motion.badgePulse`. */
  readonly pulse?: boolean;
}

export interface TemplateVideo {
  readonly animation: readonly VideoAnimation[];
  /** مدة تلاشي الخروج — رقم أو مرجع `brand.motion.outro`. */
  readonly outro: number | string;
  readonly easing: EasingName;
}

export interface Template {
  readonly id: string;
  readonly name: string;
  readonly kind: TemplateKind;
  readonly sizes: readonly string[];
  readonly fields?: readonly TemplateField[];
  readonly layers: readonly Layer[];
  /**
   * كتلة الفيديو — مطلوبة عند `kind='video'`، اختيارية على `static`
   * حيث بعض القوالب تعرض بطاقة أو فيديو (مثل `breaking`).
   */
  readonly video?: TemplateVideo;
}
