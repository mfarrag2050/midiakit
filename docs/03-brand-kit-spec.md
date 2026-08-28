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
      "family": "HNArabic",
      "source": "custom",              // custom | builtin
      "licenseAck": true,
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
                   "shortLineRatio": 0.6, "maxLines": 6 },
    "kicker":    { "max": 60, "min": 28, "weight": 300, "boxWidth": 760, "gapBelow": 56 },
    "title3l":   { "max": 84, "min": 40 },
    "source":    { "size": 34, "weight": 700 },
    "reelTitle": { "max": 76, "min": 40, "maxLines": 4, "boxInset": 150,
                   "verticalAnchor": 0.66 },
    "accentBar": { "height": 8, "minWidth": 140, "maxWidth": 620 },

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
    { "url": "…/track.wav", "label": "افتتاحية", "licenseAck": true }
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

## الهوية الافتراضية

يجب أن يوجد `DEFAULT_BRAND` **محايد تماماً** — ألوان رمادية، خط مفتوح، بلا شعار — يعمل عليه المنتج من أول ثانية قبل أن يرفع العميل أي شيء. هذا اختبار صحة للفصل: إن احتاج المحرك لقيمة من AA لكي يعمل، فالفصل لم يكتمل.
