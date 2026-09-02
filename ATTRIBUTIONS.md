# ATTRIBUTIONS

المصادر الخارجية المُستعملة في المحرك (`packages/engine`) والقوائم المشحونة
معه (`data/external/*.json`). كل مورد بترخيصه ونص إسناده الرسمي.

## البيانات المفلترة

### 1. GeoNames — أسماء الأماكن العربية

- **الملف المُشتق:** `data/external/places.json` (3,146 اسماً، 71 KB).
- **المصدر:** GeoNames alternateNamesV2 + cities15000 + countryInfo
  (تنزيل: 2026-09-01 من `download.geonames.org`).
- **الترخيص:** Creative Commons Attribution 4.0 (CC-BY-4.0)
  — https://creativecommons.org/licenses/by/4.0/
- **الإسناد الرسمي المطلوب:**
  > This work uses **GeoNames Gazetteer** geographical database
  > (https://www.geonames.org/) — licensed under CC BY 4.0.
- **الاستعمال:** يُستهلَك في `arabic-lexicon/extended.ts` لكشف أسماء الأماكن
  المركّبة (بيت لحم، رأس الخيمة، دير البلح…) عبر أزواج الكلمات المتجاورة —
  قاعدة الكسر الدلالي رقم «place-pair» (docs/07 §2).
- **التنبيه:** GeoNames يُعلن أن البيانات تُقدَّم *كما هي* دون ضمان الدقة
  أو الاكتمال أو الحداثة (منطقة سياسية متغيّرة). المشروع يتعامل معها
  كإشارة تيبوغرافية، لا كمرجع جغرافي رسمي.

### 2. Wikidata — الكيانات المؤسسية العربية

- **الملف المُشتق:** `data/external/entities.json` (2,659 كياناً، 113 KB).
- **المصدر:** ستة استفسارات SPARQL على `query.wikidata.org` (2026-09-01):
  - منظمات دولية (Q484652)
  - هيئات حكومية (Q327333) في الدول العربية والجوار
  - أحزاب سياسية (Q7278) في الدول العربية والجوار
  - وسائل إعلام (Q11033/Q1616075/Q1002697/Q11424) في الدول العربية والجوار
  - جامعات (Q3918/Q875538) في الدول العربية والجوار
  - أندية كرة قدم (Q476028) في الدول العربية + أوروبا الكبرى
- **الترخيص:** Creative Commons CC0 1.0 Universal (Public Domain)
  — https://creativecommons.org/publicdomain/zero/1.0/
- **الإسناد الرسمي (تطوّعي، الترخيص لا يشترطه):**
  > Structured data from **Wikidata** (https://www.wikidata.org/),
  > released to the public domain under CC0 1.0.
- **الاستعمال:** يُستهلَك في `arabic-lexicon/extended.ts` لكشف الكيانات
  المؤسسية المركّبة (منظمة التعاون الإسلامي، حركة حماس، جامعة الأزهر…)
  عبر أزواج الكلمات المتجاورة — قاعدة «entity-pair» (docs/07 §2).

### 3. Titles — قائمة يدوية

- **الملف:** `data/external/titles.json` (155 لقباً، 3 KB).
- **المصدر:** تنسيق يدوي من ممارسات الغرف الإخبارية العربية —
  لا مورد خارجي، لا ترخيص خارجي.
- **التصنيف:** سياسي (الرئيس، الأمير، الوزير…) · عسكري (اللواء،
  الفريق، المشير…) · قضائي (القاضي، النائب العام…) · ديني (الشيخ،
  المفتي، البابا…) · إعلامي (المذيع، الصحفي…) · رياضي (المدرب،
  اللاعب…) · إضافة (أبو، أم، ابن).
- **الاستعمال:** يُستهلَك في `arabic-lexicon/extended.ts` لكشف نمط
  «لقب + اسم» (الرئيس بشار الأسد، وزير الخارجية التركي…) — قاعدة
  «title-name» (docs/07 §2).

## عيّنة القياس (RSS)

- **الملف:** `data/external/rss-headlines.json` (265 عنواناً، 55 KB).
- **المصادر:** ثمانية موجزات RSS عامة (2026-09-01):
  - Al Jazeera (aljazeera.net/aljazeerarss/…)
  - BBC Arabic (feeds.bbci.co.uk/arabic/rss.xml)
  - Al Sharq Al Awsat (aawsat.com/feed)
  - Deutsche Welle Arabic (rss.dw.com/xml/rss-ar-all)
  - Al Masry Al Youm (almasryalyoum.com/rss/rssfeeds)
  - RT Arabic (arabic.rt.com/rss/)
  - Middle East Online (middle-east-online.com/rss.xml)
- **الاستعمال:** قياس مرجعي لبوابتي (ج) — لا تدهور في الملء ≤5% —
  و (د) — تراجع softness ≤3%. **ليست بيانات تدريب** — عناوين حقيقية
  للمقارنة الطباعية بين الوضع الافتراضي والدلالي. لا وسم كيانات هنا.
- **حدود الاستعمال:** المحتوى قابل للاختبار الداخلي فقط بموجب استعمال
  عادل (research/benchmarking) — لا يُعاد نشره كما هو خارج المشروع.

### 4. arabic-diacritizer — التشكيل الآلي

- **الاستهلاك:** خدمة معزولة `services/diacritizer/` — لا تبعية بايثون
  داخل `packages/engine`. المحرك يستقبل النص المشكّل كأيّ نصّ (L-12).
- **المصدر:** https://pypi.org/project/arabic-diacritizer/ (v1.0.0،
  Zain Mahmood، مارس 2026).
- **الترخيص:** MIT.
- **الإسناد الرسمي:** MIT لا يشترط إسناداً في المخرج، لكن نُوثّقه هنا:
  > Diacritization powered by **arabic-diacritizer**
  > (https://pypi.org/project/arabic-diacritizer/) — MIT License,
  > Zain Mahmood, 2026.
- **البنية:** BiLSTM ثلاثي الطبقات + Bahdanau attention، تصنيف على
  15 فئة تشكيل. ~18MB نموذج + ~29MB كاش كلمات.
- **الدقّة المُعلَنة:** معدّل خطأ ~6.6% على معيار Tashkeela — يكفي
  لسياق العرض التلفازي/الرقمي، ليس مصدراً للمصاحف أو النصوص التعليمية.
- **التبعيات الثقيلة:** PyTorch 2.13 (~2GB). معزولة في `services/
  diacritizer/.venv` — لا تدخل `pnpm install` الرئيسي.

## المُعلَّق — WojoodGaza

- **الحالة:** غير محمَّل. مطلوب لبوابتي (أ) صفر كسر داخل Infinity
  و (ب) ≥70% انخفاض في كسور 1000.
- **السبب:** التنزيل يحتاج تقديم نموذج Google Forms أكاديمي عبر
  https://sina.birzeit.edu/wojood/. لا واجهة تنزيل مباشر.
- **الترخيص المتوقّع:** CC-BY-4.0 (مذكور في WojoodFine؛ يُتحقَّق عند
  وصول WojoodGaza).
- **حالة الطلب:** ⏳ **لم يُرسَل بعد** — على المالك تقديمه (يحتاج تفاصيل
  مؤسسية أكاديمية). تاريخ الإرسال يُسجَّل هنا وفي PHASES.md حين يتمّ:
  `تاريخ الإرسال: ______`  ·  `تاريخ الوصول المتوقّع: ______`.
- **الأثر:** بوابتا (أ) و (ب) في PHASES.md مُعلَّقتان — لم تُغلَق —
  حتى وصول المجموعة. النتائج الحالية لبوابتي (ج) و (د) صالحة على 265
  عنواناً حقيقياً، لكن **لا تحلّ محلّ** قياس دقيق للكسور داخل Infinity
  والانخفاض في 1000 — وهما جوهر الميزة تصنيفياً.

## شعارات المنصات — فحص الرخص (2026-09-02)

**السياق:** طبقة الإسناد في الطور 3.8 تحتاج «مصدر: تيك توك · @username»
مع شعار المنصة. الشعار علامة تجارية. قبل تنزيل أيّ شعار، فُحصت إرشادات
كل منصة على حدة. القاعدة المُعطاة من المالك: *إن كانت الإرشادات غامضة
أو مقيّدة، توقّف قبل التنزيل — لا يُفترض السماح*.

### المحصّلة القصيرة

| المنصة | الحكم | الإسناد النصّي | الشعار |
|---|---|---|---|
| TikTok | 🟡 مقيّد | مسموح (Nominative fair use) | ❌ لا يُشحن — يحتاج مراجعة قانونية |
| X (Twitter سابقاً) | 🔴 غامض | مسموح | ❌ لا يُشحن — يحتاج مراسلة `trademarks@x.com` |
| Instagram | 🔴 مُقيَّد صراحةً | مسموح | ❌ لا يُشحن — Meta تشترط إذناً مكتوباً للمنتجات التجارية |
| Facebook | 🔴 مُقيَّد صراحةً | مسموح | ❌ لا يُشحن — نفس شرط Meta |
| YouTube | 🔴 مُقيَّد بنموذج | مسموح | ❌ لا يُشحن — يحتاج `Brand Use Request Form` (Google، مدة أسبوع) |
| Telegram | 🟡 غامض | مسموح | ❌ لا يُشحن — «راجع الإرشادات» بلا رخصة صريحة للـSaaS |

**النتيجة:** 5 من 6 منصات مُقيَّدة أو غامضة. **قرار: لا يُشحن أيّ شعار
منصّة في `packages/*`.** الإسناد النصّي فقط في الافتراضي. الشعار يبقى
عبر آلية *BYO* — مماثلة لآلية الخطوط: العميل يرفع الشعار الذي رخّصه (أو
حصل على إذنه) في `brand.attribution.logos.{platform}` وتبقى المسؤولية
القانونية عليه لا على المنتج.

### التفاصيل بالمنصة

#### TikTok — 🟡 مقيّد

- **الإرشادات:** https://www.tiktok.com/legal/page/global/bc-policy/en
  (Branded Content Policy، تسري 2026-08-31)
- **الإسناد النصّي:** مسموح تحت *Nominative fair use* — استعمال «تيك توك»
  لتعريف المصدر، بشرط أن لا يُوحي بالرعاية أو الشراكة.
- **الشعار (البيتم):** إرشادات TikTok لا تصرّح بالسماح للـSaaS. النصّ
  في السياسة الرسمية يذكر أن الاستعمال لأغراض تجارية يحتاج إذناً مسبقاً.
- **الحكم:** الإسناد النصّي فقط. الشعار *BYO*.

#### X (سابقاً Twitter) — 🔴 غامض

- **الإرشادات:** https://about.x.com/en/who-we-are/brand-toolkit
  (تعذّر الوصول المباشر — HTTP 402 عند الفحص الآلي).
- **الإسناد النصّي:** «X» و«@username» مسموح للإشارة إلى مصدر منشور.
- **الشعار:** لكل استعمال للعلامة يجب مراسلة `trademarks@x.com`
  للحصول على إذن كتابي. السياسة بعد الاستحواذ غير موثّقة علناً بوضوح.
- **الحكم:** الإسناد النصّي فقط. الشعار يحتاج قرار المالك حول
  الاتصال بـX.

#### Instagram — 🔴 مُقيَّد صراحةً

- **الإرشادات:** https://www.meta.com/brand/resources/instagram/instagram-brand/
- **الاقتباس:** *«If you plan to use the Instagram name or logo in a
  product you sell… you need to contact Meta directly»*.
- **الحكم:** الإسناد النصّي فقط. الشعار *BYO* أو تركه لآلية مستقبلية
  حيث يطلب المالك إذناً كتابياً من Meta.

#### Facebook — 🔴 مُقيَّد صراحةً

- **الإرشادات:** https://www.meta.com/brand/resources/facebook/logo/
- **الاقتباس:** *«Facebook does not permit or license any of its assets
  for use on merchandise or other products»* + شرط الإذن الكتابي للمنتجات.
- **الحكم:** نفس Instagram — الإسناد النصّي فقط. الشعار *BYO*.

#### YouTube — 🔴 مُقيَّد بنموذج

- **الإرشادات:** https://www.youtube.com/howyoutubeworks/resources/brand-resources/
  + https://developers.google.com/youtube/terms/branding-guidelines
- **الاقتباس:** *«You should submit a brand use request in English for
  review through the Brand Use Request Form. Please allow up to a week
  for a reply.»*
- **الحكم:** الإسناد النصّي فقط (يشمل «قناة X على يوتيوب»).
  الشعار *BYO* أو انتظار تصديق Brand Use Request من قِبل المالك.

#### Telegram — 🟡 غامض

- **الإرشادات:** https://telegram.org/tour/screenshots (شعارات مُتاحة)
  + https://telegram.org/tos/content-licensing.
- **الاقتباس:** «check the Telegram official brand guidelines before
  commercial use» — لكن لا رخصة صريحة للـSaaS، ولا تصريح استعمال
  الشعار في منتج تجاري.
- **الحكم:** الإسناد النصّي فقط. الشعار *BYO*.

### آلية الشعارات — ثلاثة أوضاع

بالتوازي مع نمط الخطوط (`fonts.primary.licenseAck` يُقرّ به العميل عند
رفع خطّ رخّصه)، تحتوي هوية العميل على كتلة `attribution` بحقل حرج:
`logoMode` يحدّد سلوك عرض الشعار.

```jsonc
"attribution": {
  "logoMode": "none",                // 'none' | 'generic' | 'official'
  "platformNameStyle": "ar",         // 'ar' | 'latin' — تيك توك مقابل TikTok
  "separator": " · ",                // بين اسم المنصة والمقبض
  "iconSize": 48,                    // بكسل عند canvas 1080
  "logoAcks": {                      // مطلوبة فقط حين logoMode='official'
    "tiktok":   { "licenseAck": false, "ackBy": "", "ackAt": "" },
    "x":        { "licenseAck": false, "ackBy": "", "ackAt": "" },
    "instagram":{ "licenseAck": false, "ackBy": "", "ackAt": "" },
    "youtube":  { "licenseAck": false, "ackBy": "", "ackAt": "" },
    "telegram": { "licenseAck": false, "ackBy": "", "ackAt": "" },
    "facebook": { "licenseAck": false, "ackBy": "", "ackAt": "" }
  }
}
```

**الأوضاع الثلاثة:**

1. **`logoMode: 'none'`** — نصّ فقط. لا أيقونة، لا شعار.
   الافتراضي في `DEFAULT_BRAND`. أنظف قانونياً. يبقى:
   «المصدر: تيك توك · @username».

2. **`logoMode: 'generic'`** — أيقونة محايدة نصمّمها نحن داخل المحرك:
   دائرة مملوءة بلون الهوية + حرف/رمز عام (▶ فيديو، @ نصّ).
   لا علامة تجارية أصلاً. تُشحن مع `packages/engine`.
   تحلّ 80% من الحاجة البصرية بصفر مخاطرة قانونية.

3. **`logoMode: 'official'`** — الشعار الرسمي مرسوماً من مكتبة
   `simple-icons` (CC0). المسار هندسي (Path2D) يُملأ بلون
   الهوية عبر `ctx.fill()`. يشترط:
   - `logoAcks[platform].licenseAck === true` (**إقرار قانوني صريح**)
   - `logoAcks[platform].ackBy` (اسم صاحب القرار في الوكالة)
   - `logoAcks[platform].ackAt` (تاريخ ISO 8601)

   المحرك يرفض الرسم إن كان `licenseAck !== true` — يرمي خطأ صريحاً
   ويتراجع إلى `'generic'` إن كان الوضع صريحاً (أو `'none'` عند
   الأمان). المسؤولية القانونية على العميل الذي أقرّ.

### 5. simple-icons — مسارات شعارات المنصات

- **المكتبة:** `simple-icons` (npm)، >3,000 شعار علامة تجارية،
  كلٌّ ملفٌّ SVG (viewBox 24×24) + لون العلامة (`.hex`) + المسار (`.path`).
- **الترخيص:** **CC0 1.0 Universal (Public Domain)**.
  https://creativecommons.org/publicdomain/zero/1.0/
- **الرابط الرسمي:** https://simpleicons.org/
- **الأثر الحرج على قرارنا (نصّ حرفي من رخصة CC0):**
  > «No trademark or patent rights held by Affirmer are waived,
  > abandoned, surrendered, licensed or otherwise affected by this
  > document.»
- **الترجمة العملية:** CC0 يُطلق **رسم** الشعار للعموم، لا يُطلق
  **العلامة التجارية** نفسها. تيك توك تبقى ملكاً لـByteDance، إنستغرام
  لـMeta، إلخ. إرشادات كل منصة تسري كما لو كان الرسم أصلياً.

**لماذا يُختار مع ذلك:**
1. يحلّ مشكلة **التوزيع**: لا نشحن ملف صورة نستنسخه، بل مسار هندسي
   عام (public domain). لا نخالف حق النشر على *الرسم*.
2. يحلّ مشكلة **الجودة البصرية**: Path2D يُرسم بلون brandKit عبر
   `ctx.fill()`، يتحجّم مع `iconSize` بلا تشويش، يحاذي مع خط الأساس
   بدقّة.
3. يوحّد المصدر: ستّ منصات من ملف npm واحد.

**لا يحلّ مشكلة الاستخدام:** العميل يعرض علامة تجارية في مخرج تجاري.
هذا يبقى قراره ومسؤوليته — وهو ما يُقرّ به في `logoAcks[platform].licenseAck`.

**قاعدة الشحن:** `packages/engine` يستورد `simple-icons` كتبعية، لكن
لا يستعمله إلا حين `logoMode='official'` في هوية العميل. حين الوضع
`'none'` أو `'generic'`، الاستيراد ديناميكي (`await import`) يبقى
موزون-الأداء.

**قواعد استعمال داخل المحرك:**
- الوصول إلى مسار الشعار عبر `siTiktok.path`، `siX.path`… فقط.
- **لا** نستعمل `siTiktok.hex` (اللون الرسمي للعلامة) — نستعمل لون
  brandKit فقط. سبب: نتحاشى استحضار الهوية البصرية للمنصة إلى جانب
  رسمها؛ نقتصر على الرسم الهندسي بلون العميل.
- **لا** نضيف نصّ «TikTok™» أو رمز الملكية — الإشارة النصّية إلى اسم
  المنصة تستعمل `platformNameStyle` (عربي/لاتيني) بلا رموز ملكية.

### آلية `logoAcks` — الفصل عن مسار الأصل

اختلاف عن الخطوط: لا نطلب `url` من العميل، لأن المسار يأتي من
`simple-icons` (المحرك يعرفه بمعرّف المنصة). ما يُطلب هو **الإقرار**
فقط: بأنّ العميل أخذ (أو سيأخذ) الإذن من صاحب العلامة، وأنه يتحمّل
المسؤولية القانونية.

**قاعدة الشحن:** `packages/engine`، `packages/templates`، و`brands/`
لا يشحنون أيّ شعار كصورة راسترية أو ملف SVG منفصل. الشعارات تُرسم من
مسارات `simple-icons` وقت الطلب، بلون brandKit، وبإقرار قانوني صريح.

**الأثر على الطور 3.8:** خطوة «تنزيل الشعارات» تُحذَف نهائياً.
الطبقة تُبنى بدعم `logoMode` الثلاثي، والافتراضي في `DEFAULT_BRAND` هو
`'none'`. `brands/client-demo.json` يستخدم `'generic'` للاختبار البصري.
الوضع `'official'` يُختبَر في البوابة على مقطع منفصل (مع بيانات
`licenseAck: true` صريحة في `logoAcks`).

---

## 7. Lottie — ملف اختبار من إنتاجنا

- **الملف:** `fixtures/lottie/basic-shapes.json` (Lottie v5.7.4، 400×400،
  30fps، 60 إطار = 2 ثانية، 3.5 KB).
- **المصدر:** كتابة يدوية داخل المشروع (2026-09-02). لا مصدر خارجي،
  لا LottieFiles، لا مكتبة مجتمعية.
- **السبب في الكتابة اليدوية:** ملفات LottieFiles تحمل رخصاً متفاوتة
  (بعضها CC-BY يشترط الإسناد، بعضها للاستخدام الشخصي فقط). فحص كل
  ملف يستهلك وقتاً أكثر من كتابة عيّنة صغيرة. صيغة Lottie موصوفة
  بالكامل — رسم مستطيل يدور + دائرة تتضخّم بالJSON مباشر.
- **الترخيص:** **ملك المشروع** — لا شرط إسناد خارجي. الفريق يعدّله
  أو يستبدله بحرية.
- **الاستعمال:** غير مستهلك حالياً — Lottie نفسه في حالة تأجيل
  (راجع `docs/12 §4`). الملف موجود جاهزاً حين يُعاد فتح البند
  (إصدار skia-canvas يكشف Skottie، أو ربط Node آخر لـSkia).
- **الأثر على المخطط:** `docs/03` يحمل حقل `lottieAssets[]` معلَّقاً
  بمخطط `licenseAck` مماثل لآلية الخطوط وشعارات المنصات — للمرحلة 4
  حين يرفع العميل ملفاته. **الرخصة مسؤولية العميل عندئذٍ لا مسؤوليتنا.**

## بروتوكول تحديث الإسناد

عند إضافة/تحديث أيّ مورد خارجي:
1. نزّل بالطلب الرسمي (curl مع User-Agent يعرّف المشروع).
2. سجّل تاريخ التنزيل ورقم الإصدار (إن أعلن).
3. أضف قسماً هنا بالترخيص ونص الإسناد ومسار الاستعمال.
4. تأكد أن `data/external/raw/` ليس مُتَتبَّعاً في git (تحقّق `.gitignore`).
