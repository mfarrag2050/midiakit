# 03 — مواصفة Brand Kit

كل قيمة هنا مستخرجة من الكود الحالي حيث كانت **مثبتة داخل دوال الرسم**. هذا الملف هو نتيجة تحريرها.

## أين كانت مدفونة

| القيمة | مكانها في الكود الحالي | الوظيفة |
|---|---|---|
| `#B1876A` | `cvAccent`, `cvAccentSpan` | خط التمييز تحت الكلمة |
| `#C1012F` | `cvBadge` | خلفية شارة "عاجل" |
| `#C82626` | `cvBreakingBg` | خلفية العاجل بلا صورة |
| `#C21C1C` | `cvBreakingBg` | تلوين الشعار المائي داخلها |
| `#1D5FC4` | `RL_BLUE` | شارة الموقع في الريلز |
| `#474c55 → #15171b` | `cvPlaceholderBg` | خلفية العرض التجريبي |
| `'عاجل'` | `cvBadge` | نص الشارة — يجب أن يكون قابلاً للترجمة |
| `0.6` | `shortRatio` في `cvWrapTokens` | نسبة السطر القصير |
| `1.34` / `1.42` | `cvLayoutHeadline` / `LEAD` | تباعد الأسطر |
| `51`, `63` | `cvRenderInto` | هامش وحجم الشعار |
| `71`, `900`, `200`, `135` | فرع `brk` | هوامش العاجل |
| `880`, `150`, `350` | `s02`, `s01` | هوامش البطاقات |
| `72`, `90` | قيم الـ sliders الافتراضية | التدرّج |

---

## المخطط

```jsonc
{
  "id": "brand_aa",
  "name": "وكالة الأناضول",
  "version": 1,
  "direction": "rtl",
  "locale": "ar",

  "fonts": {
    "primary": {
      "family": "IBM Plex Sans Arabic",
      "source": "catalog",             // catalog | upload | system
      "catalogId": "ibm-plex-sans-arabic",   // عند source=catalog
      "licenseAck": true,              // إلزامي عند source=upload فقط
      "weights": {
        "light":   { "url": "…/Light.ttf",  "value": 300 },
        "regular": { "url": "…/Roman.ttf",  "value": 400 },
        "bold":    { "url": "…/Bold.ttf",   "value": 700 }
      }
    },
    "fallback": "IBM Plex Sans Arabic, sans-serif",
    "capabilities": {                  // تُكتشف آلياً عند رفع الخط
      "kashida": true,                 // هل يقبل التطويل بشكل سليم
      "kashidaMethod": "tatweel",      // tatweel | variableAxis | glyphVariants
      "variableAxes": [],              // مثل LTAT / RTAT إن وُجدت
      "diacriticsSafe": true
    }
  },

  "colors": {
    "text":        "#FFFFFF",
    "accent":      "#B1876A",          // خط التمييز _underscore_
    "urgentBadge": "#C1012F",
    "urgentBg":    "#C82626",
    "urgentBgTint":"#C21C1C",
    "locationBadge":"#1D5FC4",
    "surface":     "#111111",
    "placeholder": ["#474C55", "#15171B"]
  },

  "logo": {
    "url": "…/logo.png",
    "size": 63,
    "margin": 51,
    "position": "bottom-left",
    "watermark": {                      // الشعار المائي في خلفية العاجل
      "enabled": true,
      "scale": 0.95,                    // نسبة من العرض
      "offsetX": -0.12,                 // نسبة من العرض
      "opacity": 0.55,
      "tint": "colors.urgentBgTint"
    }
  },

  "typography": {
    "headline":  { "max": 96, "min": 40, "lineHeight": 1.34, "boxWidth": 880 },
    "breaking":  { "max": 80, "min": 44, "lineHeight": 1.42, "boxWidth": 900,
                   "wrapMode": "uniform",             // uniform (افتراضي) | alternating (موروث)
                   "shortLineRatio": 1.0,             // 1.0 يلغي التناوب في الافتراضي؛ 0.6 موروث لـalternating
                   "maxLines": 6,
                   "minLines": 2,                     // منع سطر واحد «هابط» من أعلى البطاقة
                   "preferredLines": 3,               // النمط الصحفي القياسي؛ يُوجّه k عند التعادل
                   "readableMinRatio": 0.045,         // أرضية طوارئ لحجم الخط كنسبة من عرض القماش (4.5%)
                   "headlineFsRatio": [0.065, 0.085], // النطاق الصحفي المفضّل — على 1080 = 70-92px
                   "boxWidthRange":   [0.72, 0.88],   // نطاق عرض الصندوق كنسبة — على 1080 = 778-950px
                   "targetFill": 0.9,                 // ملء مستهدف في المسارات غير preferLargestFs
                   "swapMaxFsDiff": 6,                // فارق fs الأقصى لقاعدة «التبديل نزولاً» (بكسل)
                   "swapMinFillGain": 0.15            // مكسب الملء المطلوب لتفعيل التبديل
                 },
    "kicker":    { "max": 60, "min": 28, "weight": 300, "boxWidth": 760, "gapBelow": 56 },
    "title3l":   { "max": 84, "min": 40,
                   "minLines": 1,                    // العناوين القصيرة قد تكفيها سطر واحد
                   "preferredLines": 2               // النمط الطباعي للـtitles في card_kicker
                 },
    "source":    { "size": 34, "weight": 700 },
    "reelTitle": { "max": 76, "min": 40, "maxLines": 4, "boxInset": 150,
                   "verticalAnchor": 0.66,
                   // reelTitle يحمل كامل knobs التخطيط لأن قيمه مميّزة عن breaking
                   "lineHeight": 1.36, "boxWidth": 780, "shortLineRatio": 0.6,
                   "minLines": 1, "preferredLines": 2, "readableMinRatio": 0.045,
                   "headlineFsRatio": [0.055, 0.075], "boxWidthRange": [0.68, 0.86]
                 },
    "accentBar": { "height": 8, "minWidth": 140, "maxWidth": 620,
                   "descenderClearance": 0.32        // إزاحة underline تحت خط الأساس كنسبة من fs
                 },

    "lineHeightMode": "dynamic",       // dynamic | fixed
    // dynamic يحسب من actualBoundingBoxAscent — إلزامي عند تفعيل التشكيل
    // القيم 1.34 و 1.42 تصبح حداً أدنى لا قيمة نهائية

    "justify": {
      "mode": "kashida",               // none | space | kashida | hybrid
      "maxStretchPerSite": 0.35,       // نسبة من حجم الخط
      "maxSitesPerWord": 1,
      "minLineFill": 0.82,             // لا تبرّر سطراً أقل امتلاءً
      "lastLine": "natural"            // السطر الأخير لا يُبرَّر
    },

    "semanticBreaks": {
      "enabled": true,
      "useModel": "onAmbiguity"        // never | onAmbiguity | always
    },

    "diacritics": {
      "enabled": false,
      "mode": "full"                   // full | partial
    },

    "bidi": {
      "enabled": true,                 // نص مختلط عربي/لاتيني في السطر الواحد
      "numerals": "arabic"             // arabic (١٢٣) | latin (123)
    }
  },

  "badges": {
    "urgent": {
      "label": "عاجل",
      "fontSize": 48, "height": 66, "paddingX": 28, "radius": 12,
      "fill": "colors.urgentBadge", "textColor": "colors.text"
    },
    "location": {
      "fontSize": 36, "height": 58, "paddingX": 22, "radius": 8,
      "fill": "colors.locationBadge", "textColor": "colors.text",
      "margin": { "x": 60, "y": 60 }, "anchor": "top-right"
    }
  },

  "gradient": {
    "defaultOpacity": 0.72,
    "defaultReach": 0.90,
    "shape": [[0,1],[0.20,0.98],[0.40,0.82],[0.60,0.48],[0.80,0.06],[0.92,0]],
    "band":  [[0,0.08],[0.20,0.5],[0.36,0.92],[0.5,1.0],[0.64,0.92],[0.80,0.5],[1,0.08]]
  },

  "shadows": {
    "reelTitle": { "color": "rgba(20,30,68,0.62)", "blur": 24, "offsetY": 2 }
  },

  "margins": {
    "contentRight": 71,
    "breakingBaseline": 200,
    "sourceBaseline": 135,
    "badgeGap": 28,
    "cardTopPortrait": 150,
    "cardBottomS01": 350
  },

  "motion": {
    "segmentMin": 7, "segmentMax": 10,
    "segmentWordBase": 8, "segmentWordStep": 0.3,
    "crossfade": 0.6,
    "reelCrossfade": 0.5,
    "titleFadeIn": 0.45, "titleFadeOut": 0.5,
    "badgeDelay": 0.25, "badgeFade": 0.45,
    "lineStagger": 0.12, "lineFade": 0.42,
    "outro": 0.5,
    "badgePulse": 0.05
  },

  "outputs": {
    "x":       { "w": 1080, "h": 1080 },
    "instagram":{ "w": 1080, "h": 1440 },
    "feed":    { "w": 1080, "h": 1350 },
    "reel":    { "w": 1080, "h": 1920 }
  },

  "audio": [
    // الإصدار الأول: رفع العميل فقط. لا مكتبة مضمّنة — انظر §الموسيقى أدناه
    { "url": "…/track.wav", "label": "افتتاحية",
      "source": "upload", "licenseAck": true }
  ]
}
```

---

## قواعد التحقق

- `licenseAck` إلزامي لكل خط أو صوت مرفوع من العميل — يُخزَّن مع الطابع الزمني وهوية الرافع.
- الألوان بصيغة hex أو rgba صالحة.
- المراجع النصية (`colors.urgentBadge`) تُحلّ وقت الرندر عبر دالة `resolve(brand, path)`.
- عند غياب أي مفتاح: يُستبدل من `DEFAULT_BRAND` لا يُرمى خطأ.
- الخطوط تُحمّل ويُنتظر جهوزها قبل أي `measureText` (ADR-006).

---

## `headlineFsRatio` لا يُنسخ بين الهويات

**القاعدة:** `headlineFsRatio` (والنطاق ذاته في `reelTitle`) يعتمد على **عرض الخط** بالدرجة الأولى — عرض الحرف الوسطي، ارتفاع x، جسامة السويقات. النطاق الذي يعمل على IBM Plex Sans Arabic (0.065-0.085) لن يعمل بالضرورة على Almarai (أوسع، فيميل النطاق نحو أرقام أصغر) أو Amiri (أضيق).

**الشاهد المُنفَّذ:** `DEFAULT_BRAND.breaking.headlineFsRatio = [0.065, 0.085]` (IBM Plex). `brands/client-demo.json.breaking.headlineFsRatio = [0.075, 0.095]` (Almarai). فروق ~15%.

**الأثر على المرحلة 4 (محرّر Brand Kit):**
- بعد رفع الخط، الواجهة تشغّل خوارزمية اقتراح: قِس عرض حرف مرجعي (مثلاً «ح» أو «ن») في نطاق fs من `min` إلى `max`، وقارنه بالمرجع (IBM Plex عند fs=80). اقترح `headlineFsRatio` أعلى للخطوط الأوسع، أدنى للأضيق.
- الاقتراح **قابل للتحرير** — العميل يعاين ويعدّل قبل الحفظ.
- **درس L-02** يبقى صالحاً: النطاق نسبة، لا رقم مطلق. لا تُقفل الاقتراح على 70-92px حرفياً.

---

# مستودع الأصول

أصول مشتركة في مستودع منفصل، لا داخل المستودع الرئيسي.

```
github.com/mfarrag2050/mediakit-assets
├── fonts/
│   ├── ibm-plex-sans-arabic/{300,400,700}.{woff2,ttf}
│   ├── almarai/ · tajawal/ · cairo/ · noto-kufi-arabic/
│   ├── readex-pro/ · amiri/
│   └── catalog.json
├── audio/                    ← فارغ في الإصدار الأول
└── LICENSES/OFL-1.1.txt      ← نسخة الرخصة مع كل خط (شرط OFL)
```

**صيغتان إلزاميتان لكل خط:** `.woff2` للمتصفح و`.ttf` للخادم — `skia-canvas` لا يقرأ woff2.

**فائدة الفصل:** المستودع الرئيسي يبقى خفيفاً، والأصول تُحدَّث باستقلال، ويمكن نشرها على CDN لاحقاً بلا تغيير في الكود.

---

## كتالوج الخطوط

### القرار
**نستضيف الخطوط بأنفسنا. لا اعتماد على CDN جوجل.** ثلاثة أسباب عملية:

1. **الرندر على الخادم لا يقرأ CSS** — `skia-canvas` يحتاج ملف `.ttf` على القرص عبر `registerFont`، ولا يفهم `@font-face`.
2. **التطابق البكسلي شرط المنتج** — نسختان مختلفتان (جوجل للمتصفح، أخرى للخادم) قد تختلفان في المقاييس فتنكسر المطابقة.
3. **الاستقرار** — جوجل يحدّث الخطوط صامتاً؛ تحديث واحد يغيّر عرض الحروف فتتغير كسور السطور في مخرجات عميل قائم.

رخص SIL/OFL تسمح بالاستضافة الذاتية صراحةً، بشرط إرفاق نسخة الرخصة.

### الكتالوج المبدئي

| الخط | الطابع |
|---|---|
| IBM Plex Sans Arabic | حديث، متزن، أوزان كثيرة — **الافتراضي** |
| Almarai | نظيف، قريب من روح الصحافة |
| Tajawal | هندسي، عصري |
| Cairo | شائع، مألوف للجمهور |
| Noto Kufi Arabic | كوفي، للعناوين القوية |
| Readex Pro | مقروئية عالية |
| Amiri | نسخي كلاسيكي — للمحتوى الديني والثقافي |

**قاعدة الإدراج:** لا يُضاف خط حتى يُختبر على عنوان عاجل حقيقي بثلاثة أوزان عند 96px بعرض 900. الخط الجميل في عيّنة جوجل قد ينهار في العناوين الكبيرة.

**اختبار الكشيدة إلزامي عند الإضافة** — ليس كل خط يقبل التطويل بشكل سليم؛ بعضها يرسم كشيدة مكسورة أو بارتفاع خاطئ. النتيجة تُخزَّن في `catalog.json`:

```jsonc
{
  "id": "ibm-plex-sans-arabic",
  "family": "IBM Plex Sans Arabic",
  "license": "OFL-1.1",
  "weights": [300, 400, 700],
  "files": { "300": {...}, "400": {...}, "700": {...} },
  "capabilities": { "kashida": true, "kashidaMethod": "tatweel", "diacriticsSafe": true }
}
```

### الأثر على المنتج
الكتالوج يقلب تجربة البداية: العميل يدخل، يختار خطاً، يرى عنوانه مرسوماً في ثوانٍ. **الرفع يصبح ترقية لا شرطاً.**

وهو أوضح بيعياً: «سبعة خطوط عربية مختارة ومختبَرة للعناوين» تُقنع من لا يملك خطاً مرخّصاً — وهم كثر.

---

## الموسيقى — قرار الإصدار الأول

### لا مكتبة موسيقى مضمّنة

**السبب ليس قانونياً بل عملياً.** حتى مقاطع CC0 الخالصة تحمل خطراً:

**أنظمة Content ID تقرأ البصمات لا الرخص.** مقطع CC0 قد يستخدمه طرف آخر في ألبوم يسجّله في نظام إدارة حقوق، فتبدأ المطالبات ضد **كل مستخدم** للمقطع — بمن فيهم عميلك الذي لم يخالف شيئاً. النتيجة: ريلز إخباري يُقيَّد بعد ساعتين، والعميل يتصل بك. القانون في صفّك، والمشكلة قائمة.

**والنسبة لا تعمل في السوشيال** — معظم رخص CC-BY تشترط ذكر المؤلف، ولا أحد يكتبه تحت ريلز إخباري. لذلك CC-BY مرفوضة تماماً، لا CC0 فقط.

### ما يُعتمد بدلاً منها
1. **رفع العميل لموسيقاه** — المسار الأول في الواجهة. الوكالات الجادة تملك اشتراك Epidemic أو Artlist بالفعل
2. **صوت المقاطع الأصلي** — بطاقة العاجل غالباً لا تحتاج موسيقى، وأحياناً تُضعفها

### شروط إدخال الموسيقى لاحقاً
إن ثبت الطلب، تدخل بثلاثة شروط لا تُخفَّف:

1. **CC0 حصراً** — لا CC-BY ولا «مجاني للاستخدام» (رخص Pixabay/Uppbeat/Mixkit تمنع إعادة التوزيع)
2. **مقاطع غير شائعة ومحايدة** — إيقاع بلا لحن مميز؛ أقل عرضة للمطالبة الآلية
3. **إخلاء مسؤولية صريح في واجهة الاختيار:** «مقاطع بترخيص CC0. قد تتلقّى مطالبة آلية رغم ذلك؛ راجع قبل النشر الواسع»

**بديل أنظف عند النضج:** ترخيص 5–10 مقاطع من مكتبة تجارية بترخيص يسمح بإعادة التوزيع لعملائك. كلفة معلومة وحماية حقيقية.

### مصادر CC0 للتحقق منها لاحقاً
Free Music Archive (قسم CC0 فقط) · ccMixter (Public Domain) · Musopen (ملك عام) · Internet Archive Netlabels.

> **إلزامي قبل أي تنزيل:** تحقّق من رخصة كل مقطع في صفحته وقت التنزيل، واحفظ لقطة من صفحة الترخيص مع الملف. الرخص تتغيّر، واللقطة دليلك عند الخلاف.

---

## الهوية الافتراضية

يجب أن يوجد `DEFAULT_BRAND` **محايد تماماً** — ألوان رمادية، خط مفتوح، بلا شعار — يعمل عليه المنتج من أول ثانية قبل أن يرفع العميل أي شيء. هذا اختبار صحة للفصل: إن احتاج المحرك لقيمة من AA لكي يعمل، فالفصل لم يكتمل.
