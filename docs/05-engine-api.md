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

function wrapAlternating(
  tokens: Token[], boxW: number,
  maxFont: number, minFont: number,
  allBold: boolean, maxLines: number,
  shortRatio: number, lineHeightRatio: number,
  measure: Measurer
): WrapResult;
// سطر كامل / سطر قصير بالتناوب. يحترم \n اليدوي حرفياً.

function layoutBalanced(
  tokens: Token[], boxW: number,
  maxFont: number, minFont: number,
  allBold: boolean, measure: Measurer
): WrapResult;
// أفضل قسمة إلى سطرين: أصغر (w1 - w2) مع w1 ≥ w2

interface WrapResult { fontSize: number; lines: Token[][]; lineHeight: number }

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

## الخط الزمني (ملف 10)

```ts
function resolveAt(timeline: Timeline, t: number): ActiveState;
function interpolate(keyframes: Keyframe[], t: number): Props;
function timelineDuration(timeline: Timeline): number;
function buildAudioGraph(timeline: Timeline): AudioPlan;  // خارج drawAt
```

`drawAt` تتوسّع لتقرأ شجرة زمنية بدل مقاطع متتابعة، **وتبقى خالصة**.
الصوت خطة منفصلة: WebAudio للمعاينة، `filter_complex` للخادم. خلطه بالرسم يكسر نقاء الدالة.

## طبقة الخندق (ملف 07)

```ts
// ── التبرير بالكشيدة ──────────────────────────────────
function kashidaSites(word: string, font: FontCaps): number[];
// مواضع الوصل المسموحة داخل الكلمة.
// قواعد: لا بعد ا د ذ ر ز و — لا قبل حرف نهائي — لا داخل تشكيل كثيف

function justifyLine(
  toks: Token[], targetWidth: number, fs: number,
  cfg: JustifyConfig, font: FontCaps, measure: Measurer
): JustifiedLine;
// يوزّع التمدد على عدة كلمات لا يركّزه في واحدة.
// يحترم maxStretchPerSite و maxSitesPerWord و minLineFill.

function detectFontCaps(fontBuffer: ArrayBuffer): FontCaps;
// يُستدعى مرة عند رفع الخط ← يُخزَّن في brandKit.fonts.*.capabilities

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

| الحالي | الجديد | التغيير المطلوب |
|---|---|---|
| `cvParseTokens` | `parseTokens` | نقل كما هو ✅ |
| `cvWrapTokens` | `wrapAlternating` | `shortRatio` و `LEAD` وسيطان لا ثابتان |
| `cvLayoutHeadline` | `layoutBalanced` | تمرير `measure` بدل `cvCtx` العام |
| `cvWordWidth` / `cvSpaceWidth` / `cvLineWidth` | `Measurer` | تجميع في كائن يحمل `ctx` و `brand` |
| `cvDrawLineRightEdge` | `drawLineRTL` | تمرير `brand` للألوان |
| `cvDrawLine` | `drawLineCentered` | نفس الشيء |
| `cvAccent` / `cvAccentSpan` | طبقة `accent` | اللون من `brand.colors.accent` |
| `cvBadge` | طبقة `badge` | النص واللون والمقاسات من `brand.badges` |
| `cvGradient` | طبقة `gradient` | `CV_GRAD_SHAPE`/`BAND` إلى `brand.gradient` |
| `cvBreakingBg` | `solid` + `watermark` | الألوان من `brand.colors` |
| `cvDrawCover` | طبقة `image` | نقل كما هو ✅ |
| `cvRenderInto` | `renderFrame` | **يتفكّك بالكامل** إلى مفسّر طبقات |
| `cvDrawBrkVideoOverlay` | `drawAt` + `animation` | التوقيتات من `brand.motion` |
| `cvVidDrawAtT` | `drawAt` | نقل شبه مباشر ✅ |
| `rlDrawAt` | `drawAt` (قالب reel) | توحيد مع السابق |
| `cvSegDur` / `cvSegTimeline` | `timelineOf` | الثوابت من `brand.motion` |
| `cvVidExport` / `rlExport` | خارج المحرك | ينتقل إلى `apps/renderer` |

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
