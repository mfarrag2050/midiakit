# 05 — عقد المحرك

## القاعدة الوحيدة

> المحرك لا يعرف أن هناك واجهة.

لا `document`. لا `window`. لا `localStorage`. لا متغيرات وحدة قابلة للتغيير. كل حالة تدخل كوسيط وتخرج كقيمة.

## الواجهة العامة

```ts
// ── إطار ثابت ─────────────────────────────────────────
function renderFrame(input: RenderInput): void;

interface RenderInput {
  ctx:      CanvasRenderingContext2D;  // متصفح أو skia-canvas
  size:     { w: number; h: number };
  template: Template;
  brand:    BrandKit;
  content:  Content;
  assets:   AssetMap;                  // صور محمّلة مسبقاً
  t?:       number;                    // الزمن بالثواني — للقوالب المتحركة
}

// ── إطار عند لحظة (جسر الفيديو) ───────────────────────
function drawAt(input: RenderInput & { t: number }): void;

// ── مدة الفيديو الكلية ────────────────────────────────
function timelineOf(template: Template, brand: BrandKit, content: Content): Timeline;

interface Timeline {
  total: number;
  segments: { start: number; end: number; dur: number; index: number }[];
}
```

`drawAt` هي حجر الأساس. الرندر على الخادم ليس أكثر من:

```ts
for (let f = 0; f < Math.ceil(timeline.total * fps); f++) {
  ctx.clearRect(0, 0, w, h);
  drawAt({ ...input, t: f / fps });
  await sink.write(canvas.toBuffer('raw'));
}
```

## طبقة النص (الأهم)

```ts
type Token = { text: string; bold: boolean; accent: boolean } | { br: true };

function parseTokens(src: string): Token[];
// يفسّر *عريض* و _تمييز_ و \n

// ── الافتراضية ────────────────────────────────────────
function wrapOptimal(
  tokens: Token[], boxW: number,
  maxFont: number, minFont: number,
  allBold: boolean, maxLines: number,
  shortRatio: number, lineHeightRatio: number,
  measure: Measurer,
  mode?: 'uniform' | 'alternating',
  options?: WrapOptimalOptions
): WrapResult;
// أكبر fs مقبول يفوز؛ DP لتقسيم الأسطر ضمن كل (fs, k)؛ مود uniform افتراضي
// (كل الأسطر تستهدف نفس العرض، مع معاقبات على التفاوت وسطر الكلمة الواحدة
// واليتيم الأخير). مع options.preferLargestFs: يستكشف (fs, boxW, k) بترتيب
// أكبر fs → أكبر boxWidth → أدنى انحراف → أقرب preferredLines. يقبل
// boxWidthCandidates و fsRange و justifyCapacityConfig (يعتمد قبول ما-بعد
// الكشيدة عبر estimateLineCapacity).

interface WrapOptimalOptions {
  minLines?: number;
  preferredLines?: number;
  readableMin?: number;              // أرضية طوارئ بالبكسل (canvasW × readableMinRatio)
  targetFill?: number;                // 0.9 افتراضياً
  stddevMax?: number;                 // 0.15 افتراضياً
  absoluteMinFill?: number;           // 0.5 افتراضياً (يُرفع إلى 0.82 مع كشيدة)
  lastMinRatio?: number;              // 0.6 افتراضياً
  swapMaxFsDiff?: number;             // 6 افتراضياً
  swapMinFillGain?: number;           // 0.15 افتراضياً
  preferLargestFs?: boolean;
  boxWidthCandidates?: readonly number[];   // مشتقّ من boxWidthRange × canvasW
  fsRange?: readonly [number, number];      // مشتقّ من headlineFsRatio × canvasW
  justifyCapacityConfig?: { cfg: JustifyConfig; fontCaps: FontCaps };
}

/**
 * @deprecated الجشِعة تسمح بسطر بكلمة واحدة — مرفوض طباعياً. تبقى
 * للتوافق ولمقارنة الأداء فقط. الاستخدام الجديد عبر wrapOptimal.
 */
function wrapAlternating(
  tokens: Token[], boxW: number,
  maxFont: number, minFont: number,
  allBold: boolean, maxLines: number,
  shortRatio: number, lineHeightRatio: number,
  measure: Measurer
): WrapResult;

function layoutBalanced(
  tokens: Token[], boxW: number,
  maxFont: number, minFont: number,
  allBold: boolean, measure: Measurer
): WrapResult;
// أفضل قسمة إلى سطرين: أصغر (w1 - w2) مع w1 ≥ w2

interface WrapResult {
  fontSize: number;
  lines: Token[][];
  lineHeight: number;
  boxWidth: number;                   // العرض المُختار — يساوي المُدخل ما لم يوسَّع عبر boxWidthCandidates
}

interface Measurer {
  word(tok: Token, fs: number, allBold: boolean): number;
  space(fs: number): number;
  line(toks: Token[], fs: number, allBold: boolean): number;
}
// Measurer يُبنى من ctx + brand.fonts — هكذا يخرج القياس من الحالة العامة

function drawLineRTL(
  ctx, toks: Token[], rightX: number, baselineY: number,
  fs: number, allBold: boolean, brand: BrandKit
): { width: number; accentFrom: number|null; accentTo: number|null };
```

## الخط الزمني — المُنفَّذ (المرحلة 3، الجلسة الأولى) ✅

```ts
// ── نموذج الزمن ──────────────────────────────────────
interface Timeline {
  duration: number;   // ثواني (تشمل outro)
  fps: number;         // 30 افتراضاً
  outro: number;       // مدة تلاشي النهاية
}

function timelineOf(
  template: Template,
  brand: BrandKit,
  content: Readonly<Record<string, unknown>>,
  fps?: number
): Timeline;
// duration = base + outro، حيث
// base = max(motion.segmentMin,
//            min(motion.segmentMax,
//                motion.segmentMin + max(0, n - motion.segmentWordBase) × motion.segmentWordStep))
// و n = عدد كلمات العنوان. الثوابت من brand.motion (لا مثبتات).

function baseDurationForHeadline(brand: BrandKit, n: number): number;
// المعادلة أعلاه معزولة — مفيدة للاختبار.

// ── الحركة ──────────────────────────────────────────
interface ResolvedAnimation {
  target: string;         // 'badge' | 'headline' | 'source' | …
  startAt: number;        // مطلق بالثواني (بعد حلّ 'after')
  fade: number;
  stagger: number;        // per-line للـheadline، 0 لغيره
  slideY: number;         // إزاحة رأسية بكسل قبل الاستقرار
  pulse: boolean;         // نبضة قصيرة (badge)
}

function parseAnimations(
  template: Template,
  brand: BrandKit,
  headlineLineCount: number
): Readonly<Record<string, ResolvedAnimation>>;
// يحلّ مراجع brand.* في fade/stagger، ويحسب توقيت 'after: X' بمعرفة
// عدد أسطر headline (لأن اكتمال headline = startAt + fade + stagger × (lines-1)).

// ── الرندر الزمني (ADR-004) ──────────────────────────
function drawAt(args: DrawAtArgs): void;
// **دالة خالصة** من الزمن إلى إطار. لا حالة وحدة قابلة للتغيير.
// كل استدعاء يبني state محلياً. يستدعي prepareHeadline مرة (يحتاج ctx
// للقياس، لكن prep نفسه خالص)، ثم لكل طبقة يحسب alpha و translate و
// pulse-scale عند t، ويرسم بـsave/restore. headline بـstagger:
// كل سطر بـalpha و slideY مستقلَّين. outro: تراكب أسود بشفافية.

interface DrawAtArgs {
  ctx: CanvasDrawContext & CanvasFontContext;
  size: { w: number; h: number };
  template: Template;
  brand: BrandKit;
  content: Readonly<Record<string, unknown>>;
  assets?: RenderAssets;
  t: number;                          // الزمن بالثواني
  timeline?: Timeline;                // اختياري: مُحسَب مسبقاً لتفادي إعادة الحساب لكل إطار
}

// ── دوال التسهيل ────────────────────────────────────
type EasingName =
  | 'linear'
  | 'easeInQuad' | 'easeOutQuad' | 'easeInOutQuad'
  | 'easeInCubic' | 'easeOutCubic' | 'easeInOutCubic'
  | 'easeOutBack';

function ease(name: EasingName, t: number): number;   // t ∈ [0, 1] → out ≈ [0, 1]
```

`drawAt` **خالصة** — استدعاؤها بترتيب عشوائي يعطي نفس نتيجة الاستدعاء
المتسلسل. اختبار حاسم في `timeline.test.ts` يضمن هذا (يسجّل ops عبر
mock-ctx ويقارن).

الصوت خطة منفصلة (المرحلة 3.7 لمشاريع الخط الزمني الكاملة): WebAudio
للمعاينة، `filter_complex` للخادم. خلطه بالرسم يكسر نقاء الدالة.

## طبقة الخندق (ملف 07)

```ts
// ── التبرير بالكشيدة — المُنفَّذ (المرحلة 1.5) ✅ ─────
function kashidaSites(word: string, fontCaps: FontCaps): readonly number[];
// مواضع الوصل المسموحة داخل الكلمة، بترتيب تصاعدي (i = بين word[i] و word[i+1]).
// قواعد: لا بعد ا د ذ ر ز و + همزات + ة + ٱ — لا قبل حرف نهائي (i=n-2 مُستبعد)
// — أيّ تشكيل داخل الكلمة ⇒ تراجع كامل (قائمة فارغة). كلمات < 3 حروف مُستبعدة.

function pickDistributedSites(sites: readonly number[], k: number): readonly number[];
// ينتقي حتى k مواضع موزّعة بصرياً (حول وسط الكلمة أولاً).

function justifyLine(
  tokens: readonly Token[],
  targetWidth: number,
  fs: number,
  allBold: boolean,
  cfg: JustifyConfig,
  fontCaps: FontCaps,
  measure: Measurer,
  opts?: { isLast?: boolean }
): Token[];
// يوزّع التمدد round-robin عبر الكلمات (الجولة الأولى قبل الثانية) — لا
// تركيز في كلمة. يحترم maxStretchPerSite/maxSitesPerWord. **minLineFill
// تُفسَّر كملء ما-بعد-الكشيدة لا خام** — يستدعي estimateLineCapacity
// ليحسب أقصى تمدد ممكن، ويتراجع صامتاً إن لم يبلغ العتبة.
// السطر الأخير مع lastLine='natural' ⇒ يُعاد كما هو.

function estimateLineCapacity(
  line: readonly Token[],
  fs: number,
  allBold: boolean,
  cfg: JustifyConfig,
  fontCaps: FontCaps,
  measure: Measurer
): number;
// يقدّر أقصى تمدد بكسلي: Σ_words min(sites(word), maxSitesPerWord)
// × maxTatweelsPerSite × tatweelUnit. يستعمله wrap-optimal لقبول
// ما-بعد-الكشيدة، ويستعمله justifyLine لتقييم إمكانية بلوغ minLineFill.

function detectFontCaps(
  measure: Measurer,
  fs?: number
): { kashida: boolean; kashidaMethod: 'tatweel' | 'variableAxis' | 'glyphVariants' };
// يقيس عرض U+0640 عند fs (افتراضياً 80). عرض < 5% × fs ⇒ kashida:false،
// فيعود justifyLine بلا لمس (تراجع صامت). يُستدعى مرة عند رفع الخط،
// وتُخزَّن النتيجة في brandKit.fonts.primary.capabilities.

export const TATWEEL = 'ـ';  // محرف التطويل — يُكرَّر لتوسيع السطر

// ── كسر السطور الدلالي ────────────────────────────────
type BreakPenalty = (tokens: Token[], atIndex: number) => number;
// 0 = كسر مثالي، ∞ = ممنوع

function rulePenalty(tokens: Token[], at: number): number;
// قواعد عربية فورية بلا نموذج: حروف الجر، العدد ومعدوده،
// الأسماء الموصولة، منع الكلمة اليتيمة

// wrapAlternating و layoutBalanced يستقبلان breakPenalty
// ويختاران أقل كلفة إجمالية بدل أقل فرق عرض فقط

// ── النص ثنائي الاتجاه (BiDi) ─────────────────────────
type Run = { text: string; dir: 'rtl' | 'ltr' };

function splitBidiRuns(text: string): Run[];
// يقسم النص إلى مقاطع حسب الاتجاه

function orderRuns(runs: Run[], base: 'rtl'): Run[];
// يعكس ترتيب المقاطع اللاتينية داخل السياق العربي

function mapNumerals(text: string, style: 'arabic'|'latin'): string;

// إلزامي قبل أول عرض حي — ملف 09.
// أي اسم لاتيني وسط عنوان عربي (علامة تجارية، منظمة، وسم)
// يظهر بترتيب مقلوب بدونه. المحرّك اليوم يفترض RTL خالصاً.

// ── التشكيل ───────────────────────────────────────────
function diacritize(text: string, mode: 'full'|'partial'): Promise<string>;
// خارج المحرك — في apps/renderer أو خدمة منفصلة

function measuredLineHeight(
  ctx, line: Token[], fs: number, minRatio: number
): number;
// يحسب من actualBoundingBoxAscent — إلزامي عند التشكيل،
// وإلا تصادمت العلامات مع السطر الأعلى
```

## الخطوط

```ts
async function loadBrandFonts(brand: BrandKit): Promise<void>;
// FontFace في المتصفح، registerFont في Node
// يجب أن يكتمل قبل أي measureText — وإلا انكسرت السطور عشوائياً (ADR-006)
```

---

## خريطة النقل من الكود الحالي

| الحالي | الجديد | التغيير المطلوب / الحالة |
|---|---|---|
| `cvParseTokens` | `parseTokens` | نقل كما هو ✅ |
| `cvWrapTokens` | ~~`wrapAlternating`~~ → `wrapOptimal` | ✅ افتراضي `uniform` بـ DP؛ `wrapAlternating` `@deprecated` للتوافق |
| `cvLayoutHeadline` | `layoutBalanced` | تمرير `measure` بدل `cvCtx` العام ✅ |
| `cvWordWidth` / `cvSpaceWidth` / `cvLineWidth` | `Measurer` | تجميع في كائن يحمل `ctx` و `brand` ✅ |
| `cvDrawLineRightEdge` | `drawLineRTL` | تمرير `brand` للألوان ✅ |
| `cvDrawLine` | `drawLineCentered` | نفس الشيء ✅ |
| `cvAccent` / `cvAccentSpan` | طبقة `accent` (3 أوضاع) | ✅ underline/above-first-line/span |
| `cvBadge` | طبقة `badge` | ✅ النص/اللون/المقاسات من `brand.badges` |
| `cvGradient` | طبقة `gradient` | ✅ `CV_GRAD_SHAPE`/`BAND` إلى `brand.gradient` |
| `cvBreakingBg` | `solid` + `gradient` fallback | ✅ (watermark مُنفَّذ لكن التلوين مؤجَّل) |
| `cvDrawCover` | طبقة `image` | نقل كما هو ✅ |
| `cvRenderInto` | `renderFrame` (مفسّر طبقات) | ✅ في `packages/engine/src/render.ts` |
| `cvDrawBrkVideoOverlay` | `drawAt` + `template.video.animation` | ✅ التوقيتات من `brand.motion` |
| `cvVidDrawAtT` | `drawAt` | ✅ خالص من الزمن إلى إطار (ADR-004) |
| `rlDrawAt` | `drawAt` (قالب reel) | ✅ توحيد كامل — نفس المفسّر |
| `cvSegDur` / `cvSegTimeline` | `timelineOf` | ✅ الثوابت من `brand.motion` |
| `cvVidExport` / `rlExport` | `apps/renderer` (خارج المحرك) | ✅ أنبوب مباشر إلى FFmpeg (ADR-008) |

## ما يُحذف نهائياً

- `cvCtx`, `CVW`, `CVH` — متغيرات عامة مع استعادة يدوية بـ `finally`
- كل `document.getElementById` داخل مسار الرسم
- `localStorage` داخل المحرك
- منطق `MediaRecorder` و `captureStream`
- جسر Photopea (`postMessage`) — يصبح إضافة اختيارية خارج النواة
- الشعارات base64 (`AA_LOGO_MAIN`, `AA_LOGO_486`, `AA_LOGO_978`, `CV_LOGO`)
- `AUDIO_TRACKS` المثبتة

## اختبارات القبول

1. `renderFrame` يعمل في Node دون أي DOM.
2. نفس المدخلات ⇒ نفس البكسلات في المتصفح وNode (فرق ≤ 1%).
3. هويتان مختلفتان ⇒ مخرجان مختلفان بلا تعديل كود.
4. `DEFAULT_BRAND` المحايد يُنتج بطاقة صالحة.
5. `drawAt(t)` قابلة للاستدعاء بأي ترتيب زمني (لا حالة متراكمة).
6. رندر متوازٍ لهويتين لا يتداخل.
7. لقطات مرجعية (snapshot) للقوالب الأربعة تمنع الانحدار.

### اختبارات طبقة الخندق

8. `kashidaSites` لا تُعيد موضعاً بعد `ا د ذ ر ز و` ولا قبل حرف نهائي.
9. سطر مبرَّر يطابق `targetWidth` بفارق ≤ 1 بكسل.
10. التمدد موزّع لا مركّز: لا كلمة تحمل أكثر من `maxSitesPerWord`.
11. خط لا يدعم التطويل ⇒ التراجع التلقائي إلى `mode: space` بلا خطأ.
12. «مجلس الأمن الدولي» لا تنقسم بين سطرين عند تفعيل الكسر الدلالي.
13. نص مشكَّل: لا تصادم بين علامات سطر والسطر الذي فوقه.

### اختبارات BiDi والذروة

14. «مؤتمر Brussels للسلام» يظهر بترتيب صحيح داخل عنوان عربي.
15. تبديل `numerals` يحوّل 2026 إلى ٢٠٢٦ بلا كسر القياس.
16. تسع مهام فيديو متزامنة: لا مهمة في طابور `urgent` تتجاوز 45 ثانية للبدء.
17. مقطع مصدر معطوب يُرفض قبل دخول الطابور، لا يشغل عاملاً.
