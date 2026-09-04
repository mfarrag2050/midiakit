# 04 — مواصفة القوالب

القالب **لا يحمل لوناً ولا خطاً**. يحمل بنية ومراجع إلى الهوية.

## الشكل العام

```jsonc
{
  "id": "breaking_v1",
  "name": "عاجل",
  "kind": "static",              // static | video
  "sizes": ["x", "instagram"],
  "fields": [                    // ما يملأه المستخدم في الواجهة
    { "key": "headline", "type": "richtext", "required": true,
      "wordRange": [12, 20], "hint": "Enter = كسر سطر يدوي" },
    { "key": "source",   "type": "text", "required": false },
    { "key": "image",    "type": "image", "required": false }
  ],
  "layers": [ /* بالترتيب من الخلف للأمام */ ]
}
```

## أنواع الطبقات

| النوع | الوصف | خصائص |
|---|---|---|
| `image` | صورة الخلفية | `fit: cover`, `crop`, `fallback` |
| `solid` | لون صلب | `fill` |
| `watermark` | شعار مائي ملوّن | `from: brand.logo.watermark` |
| `gradient` | تدرّج | `direction: top\|bottom\|center`, `opacity`, `reach` |
| `headline` | العنوان | `wrap: balanced\|alternating`, `anchor`, `offset`, `maxLines` |
| `kicker` | السطر العلوي | `weight`, `align` |
| `source` | المصدر | `size`, `anchor` |
| `badge` | شارة | `label`, `fill`, `anchor`, `radius` |
| `accent` | خط التمييز | `mode: span\|underline`, `color` |
| `logo` | الشعار | `from: brand.logo` |

## أنماط اللف

- **`balanced`** (البطاقات): يقسم الكلمات إلى سطرين بحيث يكون فرق العرض أصغر ما يمكن مع `w1 ≥ w2`. يصغّر الخط بخطوة 2px حتى الاتساع.
- **`alternating`** (العاجل والريلز): سطر بعرض كامل، ثم سطر بـ `shortLineRatio` (0.6)، بالتناوب. يعطي الشكل الهرمي الصحفي.
- **`manual`**: إذا احتوى النص على `\n` يُحترم كسر المستخدم حرفياً ويُصغَّر الخط فقط.

---

## القوالب الأربعة المحوَّلة

### `card_centered` (كان s02)

```jsonc
{
  "id": "card_centered", "kind": "static",
  "sizes": ["x", "instagram"],
  "layers": [
    { "type": "image", "fit": "cover" },
    { "type": "gradient", "direction": { "square": "center", "portrait": "top" },
      "from": "brand.gradient" },
    { "type": "headline", "wrap": "balanced", "align": "center",
      "font": "brand.typography.headline",
      "position": { "square": "middle", "portrait": { "top": 150 } } },
    { "type": "accent", "mode": "span", "fallback": "underline",
      "color": "brand.colors.accent" },
    { "type": "logo", "from": "brand.logo" }
  ]
}
```

### `card_bottom` (كان s01)

```jsonc
{
  "id": "card_bottom", "kind": "static",
  "layers": [
    { "type": "image", "fit": "cover" },
    { "type": "gradient", "direction": "bottom", "from": "brand.gradient" },
    { "type": "headline", "wrap": "balanced", "align": "center",
      "anchor": "bottom", "offset": { "bottom": 350 } },
    { "type": "accent", "mode": "span", "fallback": "above-first-line" },
    { "type": "logo", "from": "brand.logo" }
  ]
}
```

### `card_kicker` (كان 3Lines)

```jsonc
{
  "id": "card_kicker", "kind": "static",
  "fields": [
    { "key": "kicker",   "type": "text", "required": true },
    { "key": "headline", "type": "richtext", "wordRange": [6, 8] }
  ],
  "layers": [
    { "type": "image", "fit": "cover" },
    { "type": "gradient", "direction": { "square": "center", "portrait": "top" } },
    { "type": "kicker", "align": "center", "font": "brand.typography.kicker" },
    { "type": "accent", "mode": "underline", "target": "kicker" },
    { "type": "headline", "wrap": "balanced", "align": "center",
      "font": "brand.typography.title3l",
      "position": { "below": "kicker", "gap": "brand.typography.kicker.gapBelow" } },
    { "type": "logo" }
  ]
}
```

### `breaking` (بطاقة + فيديو)

```jsonc
{
  "id": "breaking", "kind": "static|video",
  "fields": [
    { "key": "headline", "type": "richtext", "wordRange": [12, 20] },
    { "key": "source",   "type": "text" },
    { "key": "textScale","type": "range", "min": 0.6, "max": 1.3, "default": 1.0 }
  ],
  "layers": [
    { "type": "image", "fit": "cover",
      "fallback": [
        { "type": "solid", "fill": "brand.colors.urgentBg" },
        { "type": "watermark", "from": "brand.logo.watermark" }
      ] },
    { "type": "gradient", "direction": "bottom", "onlyIf": "hasImage" },
    { "type": "headline", "wrap": "alternating", "align": "right",
      "anchor": "bottom-right",
      "offset": { "right": "brand.margins.contentRight",
                  "bottom": "brand.margins.breakingBaseline" } },
    { "type": "badge", "use": "brand.badges.urgent", "anchor": "above-headline",
      "gap": "brand.margins.badgeGap" },
    { "type": "source", "anchor": "bottom-right",
      "offset": { "bottom": "brand.margins.sourceBaseline" } },
    { "type": "logo" }
  ],
  "video": {
    "segments": { "min": 1, "max": 8,
                  "duration": "brand.motion.segment" },
    "animation": [
      { "target": "badge",    "at": 0,    "fade": 0.35, "pulse": true },
      { "target": "headline", "at": 0.30, "stagger": "brand.motion.lineStagger",
        "fade": "brand.motion.lineFade", "slideY": 26 },
      { "target": "source",   "after": "headline", "fade": 0.35 }
    ],
    "outro": "brand.motion.outro",
    "easing": "easeOutCubic"
  }
}
```

### `reel`

```jsonc
{
  "id": "reel", "kind": "video",
  "sizes": ["reel", "x", "feed"],
  "fields": [
    { "key": "title",    "type": "richtext", "wordRange": [1, 7] },
    { "key": "location", "type": "text" },
    { "key": "clips",    "type": "medialist", "accepts": ["video", "image"] }
  ],
  "layers": [
    { "type": "clipstream", "crossfade": "brand.motion.reelCrossfade" },
    { "type": "headline", "wrap": "alternating", "align": "right",
      "font": "brand.typography.reelTitle",
      "shadow": "brand.shadows.reelTitle",
      "anchor": { "y": "brand.typography.reelTitle.verticalAnchor" } },
    { "type": "badge", "use": "brand.badges.location", "field": "location" },
    { "type": "logo" }
  ],
  "modes": { "cover": "إطار ثابت عند T=0 يُصدَّر PNG" }
}
```

---

## قواعد

- كل قيمة تبدأ بـ `brand.` تُحلّ وقت الرندر.
- `onlyIf` يقبل شروطاً بسيطة فقط: `hasImage`, `isSquare`, `isPortrait`.
- `fallback` مصفوفة طبقات تُرسم إن تعذّرت الطبقة الأصلية.
- القالب يُتحقق منه بـ JSON Schema عند الحفظ، لا وقت الرندر.
- قوالب عامة (`tenant_id = null`) وقوالب خاصة بمستأجر.

## قاعدة الأولوية — القالب أيّها، الهوية أين (2026-09-02)

**المبدأ:** القالب يحدّد **أيّ العناصر تظهر** (بوجود الطبقة في `layers`)،
والهوية تحدّد **أين** تظهر (عبر `brand.placement.<element>`).

### السلوك الافتراضي

- طبقة `logo` بلا `anchor` ⇒ تُقرأ من `brand.placement.logo`.
- طبقة `badge` بلا `anchor` ⇒ تُقرأ من `brand.placement.badge`.
- طبقة `source` بلا `anchor` ⇒ تُقرأ من `brand.placement.source`.
- طبقة `attribution` بلا `anchor` ⇒ تُقرأ من `brand.placement.attribution`.

**عند تعارض المصدر مع القالب:** الهوية تفوز — يستطيع العميل تحريك
شعاره من أسفل يسار إلى أعلى يمين بتعديل هويته فقط.

### الاستثناء — `constraint: true`

القالب يستطيع فرض موضع/أنكور إذا كان **قيداً بنيوياً لا تفضيلاً تصميمياً**.
يوضَع الحقل `constraint: true` على الطبقة، **ويُشترط تعليق يشرح السبب**
(حقل `//` بالنمط JSON5-alike المسموح — الخفاء صامت).

**متى يجوز:**
- الشارة **مرتبطة تحريرياً** بعنصر آخر (شارة العاجل + العنوان تُقرآن معاً).
- المصدر يُتلى مباشرة تحت العنوان (قاعدة الإسناد الصحفية).
- الشارة الجغرافية فوق العنوان في الريلز (سياق قبل السرد).

**متى لا يجوز:**
- تفضيل جمالي — «أفضّل الشعار في الأسفل يميناً»؛ هذا للهوية.
- توافقية مع الأصل — «كان في الأداة القديمة في هذا المكان»؛ راجع القاعدة 10.

**نمط الكتابة:**

```jsonc
{
  "type": "badge",
  "use": "brand.badges.urgent",
  "anchor": "above-headline",
  "gap": "brand.margins.badgeGap",
  "constraint": true,
  "//": "شارة العاجل تُقرأ مع العنوان كوحدة تحريرية — الفصل يُنتج شارة يتيمة."
}
```

المحرك يقرأ `constraint` كوثيقة فقط — لا سلوك تنفيذي (الأنكور البنيوي
`above-headline`/`below-headline` بحدّ ذاته يفرض نفسه لأنّه يتطلّب
`state.headline` من طبقة سابقة). القيمة تجعل النية صريحة للمراجع لاحقاً.

### الأنكور الشاشي (screen anchor)

النمط التسعي (9-lattice):

```
top-left     top-center     top-right
middle-left                 middle-right
bottom-left  bottom-center  bottom-right
```

`center` عمودياً (`middle-*`) يتجاهل `offset.y`. `center` أفقياً
(`*-center`) يتجاهل `offset.x`.

## المحتوى (content) — النص كما حرّره العميل

- الحقل النصي (`content.headline` وأخواته) يحمل السلسلة **كاملةً كما
  حرّرها العميل** — بما فيها التشكيل الجزئي/الكامل/الغياب. لا حقل
  منفصل يحمل «نسخة مشكّلة» بموازاة «نسخة عارية».
- خدمة التشكيل (`services/diacritizer/`) اقتراح؛ الواجهة تعرض ناتجها
  في **حقل قابل للتحرير** والعميل يقرّر ما يُخزَّن. راجع docs/09
  §«التشكيل — العميل يملك القرار».
- **تشكيل جزئي مدعوم**: بعض الكلمات مشكّلة وبعضها لا. المحرك يقرّر
  لكل كلمة على حدة (كشيدة، ارتفاع سطر، رسم) — مُثبَت في
  `packages/engine/src/text/diacritics-interaction.test.ts`.
- `_word_` (تحديد accent span) يبقى مستقلاً عن التشكيل — يعمل على نصّ
  مشكّل بنفس صحّة عمله على نصّ عارٍ.

## `content.locale` — لغة المحتوى مستقلة (2026-09-04 · L-49)

الحقل الجديد يحدّد **سلوك المحرك** على المخرج (اتجاه، كشيدة، كسر
دلالي، خط):

```jsonc
{
  "headline": "...",
  "source":   "...",
  "locale":   "ar" | "en" | "fr" | "tr" | "es" | "de"
}
```

- **الافتراضي `"ar"`** — التوافق الرجعي كامل.
- **المجموعة تُشتقّ من `localeGroup(locale)`:** `ar` أو `latin`.
- **قاعدة الاستخدام:** `applyLocaleToBrand(brand, content.locale)`
  يُستدعى **مرة واحدة** قبل الرندر — الطبقات تقرأ من brand المُعدَّل.

### السلوك المتبدَّل عند `latin`

| المكوّن | `ar` | `latin` |
|---|---|---|
| الاتجاه | RTL | LTR |
| الكشيدة | تعمل | **معطّلة** — لا معنى لها |
| الكسر الدلالي | قواعد المحرك | **معطّل** — لا قواعد لكل لغة |
| التشكيل | متاح (opt-in) | لا وجود له |
| اللف | `wrapOptimal` (DP) | `wrapLatin` (بسيط، منع الكلمة اليتيمة) |
| الخط | `fonts.primary` (`fonts.byLocale.ar` إن وُجد) | `fonts.byLocale.latin` إن وُجد وإلّا `primary` |
| محاذاة الأنكور | كما هي | معكوسة إن `placement.mirrorOnLTR = true` |

### `wrapLatin` — التوقّعات

- يفصل عند المسافات والشرطات فقط.
- عقوبات صارمة على:
  - **الكلمة اليتيمة** (widow) في السطر الأخير.
  - **سطر بكلمة واحدة** في غير الأخير.
- يفضّل حجم الخط الأكبر ضمن `headlineFsRatio`.
- **بلا** قواعد دلالية، **بلا** hyphenation قواعدية، **بلا** shaping متقدّم.
- المخرج `WrapResult` — نفس عقد `wrapOptimal` (توحيد الطبقة العليا).
