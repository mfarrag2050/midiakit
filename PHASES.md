# PHASES — مراحل التنفيذ

> ملف حيّ. يُحدَّث في نهاية كل جلسة عمل. الحقول: `☐` لم يبدأ · `◐` جارٍ · `☑` مكتمل.

**آخر تحديث:** 2026-09-02 (مسح الميزات docs/12 مُنجَز — أحد عشر بنداً
مصنّف؛ **المرحلة 3.8 جديدة** لامتدادات المحرك قبل المنصة؛ المرحلة 4
موسَّعة).

**ملخّص الجلسة (المرحلة 3.7 مُغلَقة):** المحرك يحمل النموذج (Timeline
model في shared) · النواة (`resolveAt` · `interpolate` بـ8 دوال تسهيل ·
`drawTimelineAt` خالصة) · الخطة (`buildTimelinePlan` مع فحص التصادم) ·
مسار الوسائط (`kenBurns` 9 نقاط أصل) · مسارات النصوص (`byWord` RTL +
مفاتيح مفتاحية + typewriter RTL + الكشيدة ثابتة عبر الإطارات) · 5
انتقالات (`crossfade` · `slide` · `wipe` · `zoom` · `blurIn` مع
`direction: rtl/ltr/auto`) · الصوت (`AudioPlan` خالصة + `ducking`
بـsidechaincompress + `filter_complex` في renderer). **@legacy حُذف
كلياً** (≈1000 سطر)، `templateToTimeline` هو الجسر، `snapshots-video/`
مرجع دائم. **266/266 اختبار · 24/24 لقطة · 5 بوابات timeline اجتازت
(media/text/transitions/audio/breaking-md5) · L-11..L-17 و L-26 مُسجَّلة.**

**قرار المالك:** واجهة الخط الزمني (§و السابقة) → المرحلة 4 (جزء من
واجهة المنصة، لا تُبنى منفصلة). فك الترميز المسبق ينتظر مقطع مصدر
حقيقي من العميل الأول.

**السابق (2026-09-02 — المرحلة 3.5):**
**ملخّص الجلسة:** `services/diacritizer/` FastAPI معزولة (arabic-
diacritizer MIT، Python 3.12 venv، منفذ 19080) · `measuredLineHeight`
في المحرك يقيس `actualBoundingBox` مع safety pad · `diacritics.enabled`
يفعّل dynamic lineHeight تلقائياً · تفاعل صحيح مع الكشيدة مُختبَر
صريحاً (12 اختبار جديد، المجموع 238) · تراجع صامت عند تعذّر الاتصال ·
`out/preview-diacritics.png` للمراجعة البصرية · **snapshots ذهبية تبقى
24/24 مطابقة** بايت-بايت (التشكيل معطّل افتراضياً) · L-12 مُسجَّل
(«المكوّنات غير-JS في خدمات معزولة، لا في المحرك»).

**السابق (2026-09-01 — المرحلة 3.5 الجزء ب-2):**
**ملخّص الجلسة:** GeoNames (CC-BY-4.0) → places.json 72KB · Wikidata (CC0)
→ entities.json 113KB · titles.json يدوي 3KB · ExtendedLexicon + 3 قواعد
جديدة (place-pair · entity-pair · title-name) · 226 اختبار أخضر · قياس
على 265 عنوان RSS حقيقي (aljazeera · bbc · aawsat · dw · almasryalyoum ·
rt · me-online · aljazeera-me) لتفادي فخّ L-05 (اختبار يوافق قواعده).
**بوابات (ج، د، أداء) اجتازت:** Δfill=+0.56%، Δstddev=-0.26% (**تحسّن —
درس L-10**)، softness regression=2.26%، p95=402ms. **بوابتا (أ) و (ب)
معلَّقتان** حتى وصول WojoodGaza (نموذج طلب أكاديمي عبر sina.birzeit.edu).

**قرار التفعيل (2026-09-01):** `DEFAULT_BRAND.typography.semanticBreaks.
enabled = true`. البوابات المُقاسة تبرّر ذلك؛ (أ) و (ب) تخصّان دقّة
القواعد لا سلامة التفعيل. المرحلة 3.5 حالتها **◐ لا ☑** — لن تُغلَق قبل
اجتياز البوابتين المعلَّقتين. `snapshots-semantic/` أُنشئت (12 لقطة
enabled=true) مع الاحتفاظ بـ `snapshots/` (12 لقطة enabled=false) مرجعاً
للتوافق الخلفي. `pnpm verify:snapshot` يقارن 24 لقطة (12 لكل وضع).

**طلب WojoodGaza:** ⏳ **لم يُرسَل بعد** — على المالك تقديمه عبر Google
Form على https://sina.birzeit.edu/wojood/ (يتطلّب تفاصيل مؤسسية أكاديمية
لا تستطيع الجلسة التقنية تقديمها). اذكر التاريخ هنا حين يُرسَل:
`تاريخ إرسال طلب Wojood: ______`.

**السابق (2026-08-31 — مراجعة ثالثة، ختامية للكشيدة):** — **قرار المالك بعد المقارنة البصرية للثلاثية A/B/C:**
- **`maxSitesPerWord = 1` نهائياً.** قيمة docs/03 صمدت أمام تجريب بصري — B (=2) رُفضت: أربعة تطويلات في الكلمة الواحدة تبدو مشوّهة لا مبرَّرة. **درس L-06:** التجريب قد يؤكّد المواصفة، لا ينقضها فقط.
- **A هي الإعداد المعتمد:** fs=74 (6.9% من القماش)، boxWidth=950 (88%)، 3 أسطر — النمط الصحفي القياسي. `preview.png` (كشيدة) + `preview-nokashida.png` (مرجع) كمقارنة دائمة.
- **`headlineFsRatio = [0.065, 0.085]` معتمد** — كان القيد المفقود في المراجعات السابقة. `readableMinRatio=0.045` يبقى أرضية طوارئ فقط.

**التحسينات المعمارية التي أعقبت الكشيدة:** (١) `wrapOptimal.fsRange` يقصر البحث داخل النطاق المفضّل أولاً، والتراجع للمدى الكامل عند الفشل. (٢) قبول ما-بعد-الكشيدة عبر `justifyCapacityConfig` — wrap يقدّر السعة عبر `estimateLineCapacity` قبل قبول (fs, boxW, k). (٣) `justifyLine.minLineFill` أُعيد تفسيرها كـ«ملء بعد الكشيدة» لا خام — بدون ذلك تظهر فجوة سلوكية بين wrap و justifyLine. (٤) مسافة المصدر `fs × 1.4` بدل `0.9`. (٥) `estimateLineCapacity` مُصدَّر من `kashida.ts` كمصدر وحيد. **161 اختبار vitest أخضر** (20 جديد للكشيدة).

**المرحلة الحالية:** 0 ☑ · 1 ☑ · 1.5 ☑ (الكشيدة) · 2 ☑ (القوالب بيانات)
· 3 ☑ (الرندر على الخادم) · 3.2 ☑ (لوحات التحكم — 2026-09-02) · 3.5 ◐
(الكسر الدلالي + التشكيل — بوابتا أ/ب معلَّقتان WojoodGaza) · **3.7 ☑
(محرّك الخط الزمني — 2026-09-02، الواجهة إلى المرحلة 4)** · **3.8 ◐
(امتدادات المحرك — الإسناد ☑ 2026-09-02، التفريغ ◐، Lottie 🔻 مؤجَّل،
SVG ☑ (2026-09-04، محرّك المشروع، 4 بوابات L-46)، كشف الوجوه ☐، التعليق الصوتي ☐).**

**التالي:** المرحلة **3.8** (امتدادات المحرك — 5 بنود: التفريغ +
القاموس · الإسناد · Lottie/Skottie · كشف الوجوه · التعليق الصوتي).
**فحص الرخصة أوّل خطوة في كل تبعية نموذجية**، لا آخرها. ثم المرحلة 4
(المنصة موسَّعة). دَين المرحلة 3.5 يظلّ ينتظر WojoodGaza بالتوازي.

**اختبار البوابة (2026-08-31، بعد جلسة الجدارة):** أُنشئت هوية ثانية `brands/client-demo.json` (طيف — Almarai، أزرق غامق/عنبر، شارة "خبر عاجل"، `headlineFsRatio=[0.075,0.095]`، `boxWidthRange=[0.68,0.86]`). `pnpm preview -- --brand=default` أنتج fs=74/boxW=950/IBM Plex/عاجل رمادي؛ `--brand=client-demo` أنتج fs=66/boxW=929/Almarai/خبر عاجل عنبر. `git diff HEAD packages/` = **صفر تغيير**. الفصل بين المحرك والهوية مُثبَت آلياً لا بادّعاء.

**بوابة المرحلة 2 (2026-08-31، لاحقة):** ☑ `packages/templates` جديدة تحمل: TEMPLATE_SCHEMA (JSON Schema draft-07 كبيانات)، `validateTemplate` (متحقق يدوي يُستدعى وقت التحميل مع مسار الخطأ التفصيلي)، وستة قوالب مبنيّة (breaking، card_centered، card_bottom، card_kicker، reel، plain) — كلها تمرّ بالتحقق عند الاستيراد. `packages/engine/src/render.ts` جديدة تحمل `renderFrame({ctx, size, template, brand, content, assets})` — مفسّر طبقات يدعم `onlyIf` (hasImage/isSquare/isPortrait) و `fallback` recursive، ويتتبّع `RenderState` للتموضع المتقاطع (headline bounds → badge/source). preview.mjs يستدعي `renderFrame` بدل الاستدعاء اليدوي. **إثبات المطابقة البكسلية:** `md5 out/preview-default.png` قبل وبعد = `a05e5cb8c777e1390779b018656cdd74` (بايت-بايت). `pnpm verify:snapshot` يجدّد المخرجات ويقارنها بايتاً-بايت مع `snapshots/preview-*.png` — الجولة الأولى: default ✓ 71162 بايت، client-demo ✓ 59207 بايت. **إثبات البوابة (قالب خامس بلا كود):** `packages/templates/src/templates/plain.json` (solid+headline+logo، verticalAnchor=0.5) — `pnpm preview -- --template=plain --brand=<name>` يرسمه دون سطر إضافي في `packages/engine`.

**بيانات الفروق حسب القالب/الهوية:**
- default × breaking: fs=74، boxW=950، 3 أسطر، ملء 99/83/73%.
- client-demo × breaking: fs=66، boxW=929، 3 أسطر، ملء 97/84/76%.
- default × plain (الجديد): يرسم على الخلفية الرمادية بلا شارة/مصدر.
- client-demo × plain (الجديد): يرسم على الخلفية البحرية Almarai — دليل نقي على فصل الطبقات عن الهوية.

**172 اختبار vitest أخضر** (11 جديد لـtemplates: يحمّل ويتحقّق ويرفض المدخلات المعطوبة).
**الحالة العامة:** كود المنتج بدأ. الأداة القديمة `reference/aa-media-kit.html` تعمل مستقلة عن المحرك الجديد.

---

## نظرة عامة

| # | المرحلة | المدة | البوابة | الحالة |
|---|---|---|---|---|
| 0 | التنظيف القانوني | أسبوعان | لا خط تجاري ولا أصل أناضول | ☑ |
| 1 | استخراج المحرك + BiDi | 4 أسابيع | هويتان مختلفتان بلا لمس كود | ☑ |
| **1.5** | **الكشيدة (قُدِّمت من 3.5)** | **أسبوعان** | **سطر مبرَّر بحافة يسرى مستقيمة عند fs مقروء** | **☑** |
| 2 | القوالب بيانات | أسبوعان | قالب خامس بملف JSON فقط | ☑ |
| 3 | الرندر على الخادم | 3 أسابيع | MP4 من CLI + معيار الذروة | ☑ |
| 3.2 | لوحات التحكم | أسبوعان | العميل يرى موقعه في الطابور | ☑ |
| 3.5 | الخندق التنافسي (الكسر الدلالي + التشكيل) | أسبوعان | لا كسر داخل وحدة معنى · تشكيل بلا تصادم | ◐ |
| 3.7 | محرّك الخط الزمني (المحرك فقط) | — | أربعة مسارات ← MP4 + العاجل لا يتأخر | ☑ |
| **3.8** | **امتدادات المحرك** (بعد مسح 12) | 3–4 أسابيع | 5 امتدادات نموذجية + تكامل نظيف | ◐ |
| 4 | المنصة (بعد اكتشاف بنود 2026-09-02) | **6–8 أسابيع** | عميل يعمل ذاتياً + سجل مراجعات + سير عمل تحريري + دورة حياة أصول | ☐ |
| 5 | النمو | مستمر | — | ☐ |

**العمود الفقري:** 0 ← 1 ← 1.5 ← 3 ← 3.7 ← 3.8 ← 4. عند اكتمالها لديك منتج كامل.

**قاعدة البوابات:** لا تُفتح مرحلة قبل اجتياز بوابة سابقتها. البوابة معيار قابل للتشغيل لا رأي.

**عند نقض قرار مرحلة (L-15/DD-06):** أضف بنداً «مراجعة أثر رجعي» يعرض:
(١) ما القرار المنقوض · (٢) ما بُني عليه · (٣) ما يستحقّ إعادة النظر
بموجب النقض · (٤) ما تُوثِّق فيه المسألة (ADR أو قسم في PHASES). النقض
بلا مراجعة أثر رجعي يبني على أرضية تُنقض دون كشف.

---

# المرحلة 0 — التنظيف القانوني

**لا يُكتب سطر واحد من كود المنتج قبل انتهائها.**

- ☑ إزالة `HelveticaNeueLTArabic-{Bold,Roman,Light}.ttf` من أي مستودع تجاري
- ☑ تقييم الخطوط المفتوحة: IBM Plex Sans Arabic · Almarai · Tajawal · Cairo · Noto Kufi Arabic
- ☑ اختيار البديل حسب أقرب وزن بصري للحالي (اختيار: IBM Plex Sans Arabic — مطابق للاحتياطي في المواصفة `docs/03-brand-kit-spec.md`، ثلاثة أوزان 300/400/700 عبر Google Fonts)
- ☑ إزالة `AA_LOGO_MAIN` · `AA_LOGO_486` · `AA_LOGO_978` · `CV_LOGO` (base64)
- ☑ إزالة `AUDIO_TRACKS` و `AA-60-SANIYE-2021_01.wav`
- ☑ فصل فرعين: `aa-internal` (يبقى للوكالة — محلي عند `ee178ca`) و `main` (تجاري)
- ☑ شعار محايد افتراضي (الأداة تعمل بلا شعار حتى يرفع العميل شعاره؛ حراسات الرسم تتخطى الشعار بصمت)
- 📎 صياغة بند إقرار ترخيص الخطوط في شروط الخدمة — **نص قانوني خارج نطاق التنفيذ الهندسي** (مهمة المالك؛ لا تحجب البوابة).

**البوابة:** ☑ الأداة تعمل بخط مفتوح وشعار محايد، وبحث نصي في `main` لا يُظهر أي أصل للأناضول.  
**الأثر:** جرد كامل في `docs/INVENTORY.md` بأرقام الأسطر. اختبار قبول الفحص النصي في `main`: `AA_LOGO`, `CV_LOGO`, `HelveticaNeueLTArabic`, `HNArabic`, `AA-60-SANIYE`, `aa_customLogo` — كلها صفر مطابقات.

---

# المرحلة 1 — استخراج المحرك

**الهدف: تشغيل الأداة نفسها بهويتين مختلفتين دون لمس كود الرسم.**
أصعب مسافة في المشروع؛ ما بعدها هندسة عادية.

## البنية
- ☑ `pnpm workspaces` + `packages/engine` بـ TypeScript (صارم: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- ☑ `packages/shared` للأنواع
- ☑ Node 20.18.1 عبر nvm، pnpm@9.15.4 عبر corepack
- ☑ vitest 2.1.9، جميع الاختبارات في Node بلا متصفح

## طبقة النص
- ☑ `parseTokens` — نقل مباشر من `cvParseTokens` (INVENTORY الأسطر 1769–1783)
- ☑ `Measurer` — واجهة قابلة للحقن: `createCanvasMeasurer(ctx, brand)` للإنتاج، `createSyntheticMeasurer()` للاختبار
- ☑ `wrapAlternating` — من `cvWrapTokens`، `shortRatio` و `lineHeightRatio` وسيطان. **`@deprecated`** — يبقى للتوافق ومقارنة الجودة فقط
- ☑ `wrapOptimal` — **الافتراضية**. برمجة ديناميكية داخل كل (fs, k)، لكن **اختيار fs بأولوية الملء لا بالكلفة**: (١) اجمع كل أزواج (fs, k) المقبولة (بلا سطر واحد، انحراف ≤ 15%، أخير ≥ 60% من المتوسّط، ملء ≥ 50%). (٢) إن بلغ أيّها `targetFill=0.9` ضمن النطاق الآمن → الأكبر fs بينها يفوز. (٣) وإلا → الأكبر fs، ثم قاعدة «التبديل نزولاً» (فرق ≤ 6px بـfs مع +15% ملء أعلى). `readableMinRatio=0.045` نسبة من عرض القماش (على 1080 = 49px) — أرضية صلبة لا سقف. `preferredLines=3` يوجّه k عند تكافؤ (fs, k). مودَان: `uniform` (افتراضي) و `alternating` (موروث). يحلّ D-07
- ☑ `layoutBalanced` — من `cvLayoutHeadline`، `measure` يُمرَّر
- ☑ `drawLineRTL` + `drawLineCentered` — من `cvDrawLineRightEdge` و `cvDrawLine`. `CanvasDrawContext` واجهة أدنى (تعمل مع Canvas في المتصفح و skia-canvas في Node بلا `lib.dom`). كلتا الدالتين تُعيدان `{width, accentFrom, accentTo}` — حتى RTL تحسب حدود التمييز الآن (الأصل لم يفعل، مواصفة 05 تطلبها)
- ☑ `mock-ctx` — يسجّل كل نداء `fillText` بحالته وقت الرسم (font/fillStyle/textAlign/direction/textBaseline)، بلا Canvas حقيقي. للاختبار فقط
- ☑ فحص نقاء آلي (`scripts/check-engine-purity.mjs`): يمنع `document/window/localStorage/navigator/self/globalThis` و `let/var` على مستوى الوحدة

## BiDi (إلزامي قبل أول عرض)
- ☑ `splitBidiRuns(text): Run[]` — تصنيف Unicode مبسّط، المحايدات تلتصق بالمقطع السابق
- ☑ `orderRuns(runs, base='rtl')` — يعكس ترتيب الكلمات داخل مقاطع LTR فقط (لا حروف الكلمة)، الفراغات المحيطية محفوظة
- ☑ `mapNumerals(text, 'arabic'|'latin')` — grapheme واحد بواحد، لا كسر للقياس
- ☑ `preprocessBidi` — دالة تركيبية تُشغَّل **قبل `parseTokens`** (طبقة لا حقن): mapNumerals → splitBidiRuns → orderRuns → دمج
- ☑ اختبار قبول: «مؤتمر Brussels للسلام» يعطي fillText بالترتيب `[مؤتمر, Brussels, للسلام]` والإحداثيات x تنازلية من اليمين
- ☑ توثيق سلوك الأقواس على حدود المقاطع (اختبار «تقرير (Reuters) من غزة») — الحد المعروف مسجَّل في D-01
- 📎 ربط `preprocessBidi` بالواجهة الحالية (نقطة الدخول الوحيدة قبل `parseTokens`) — **مؤجَّل للمرحلة 2/4** (نفس تصنيف بند الربط في السطر 203). الدالة قائمة ومُختبَرة؛ الربط يتم مع بناء واجهة Studio.

### قيد ترتيب استدعاء `preprocessBidi` — لا يُخالَف

**`preprocessBidi` تُستدعى على النص الخام قبل `parseTokens` وقبل أي لف
(`wrapAlternating` / `layoutBalanced`).**

- **السبب:** الدالة تعمل على مقاطع نصية متجاورة وتعكس ترتيب كلمات مقاطع
  LTR داخل السياق RTL. اللف يقسّم النص إلى أسطر مستقلة قد يقع بعضها كاملاً
  داخل مقطع LTR واحد؛ استدعاء `preprocessBidi` على كل سطر منفصلاً يعكس
  ترتيب كلمات ذلك السطر بمعزل عن المقطع الأصلي، فتصبح كلمة كانت الأخيرة
  في السطر الأول بلا صلة بموقع كلمات السطر الثاني. يكسر ترتيب الأسطر
  **بشكل لا يُصلح** — لا معلومات كافية بعد اللف لاستعادة النية الأصلية.
- **الترتيب الوحيد الصحيح:** `text → mapNumerals → splitBidiRuns →
  orderRuns → join → parseTokens → wrap*` — واحدة، بهذا التسلسل، ولا
  استدعاء ثانٍ لأي دالة BiDi بعد `parseTokens`.
- **الأثر على الحقن:** الواجهة الحالية تستدعي `preprocessBidi` مرة عند
  تغيّر النص لا في مسار الرسم. أي مسار جديد (طبقة، محرّر، رندر خادم)
  يمرّ بنفس نقطة الدخول.

## الأصول
- 📎 مستودع `mediakit-assets` منفصل: `fonts/` + `catalog.json` + `LICENSES/` — **مؤجَّل للمرحلة 4** (يبنى مع محرّر Brand Kit؛ IBM Plex محلي حالياً كافٍ للمحرك وعرضين).
- 📎 تنزيل 7 خطوط بصيغتَي `.woff2` (متصفح) و`.ttf` (خادم) + نسخة OFL مع كل خط — **مؤجَّل للمرحلة 4** (Almarai + IBM Plex محلّيان يكفيان للجدارة والعميل الأول).
- 📎 اختبار كل خط على عنوان عاجل حقيقي، 96px، عرض 900، ثلاثة أوزان — **مؤجَّل للمرحلة 4** (يجري وقت تفعيل الخط في `detectFontCaps`).
- 📎 اختبار قابلية الكشيدة لكل خط ← `catalog.json` — **مؤجَّل للمرحلة 4** (نفس السبب).
- ☑ `audio/` يبقى فارغاً — لا مكتبة موسيقى في الإصدار الأول (قرار قائم منذ 2026-08-28 — راجع سجل القرارات).

## الهوية
- ☑ `BrandKit` كامل من القيم المستخرجة (ملف 03) — `packages/shared/src/brand-kit.ts`
- ☑ `DEFAULT_BRAND` محايد تماماً — `packages/shared/src/default-brand.ts` (رمادي، IBM Plex Sans Arabic، بلا شعار). اختبار صحة الفصل نجح: الاختبارات تحقن هوية بديلة بتغيير `colors.text` وتتحقّق أن fillStyle تبعها
- ☑ `resolve(brand, path)` + `resolveBrand(brand)` — `packages/engine/src/brand/resolve.ts`. حل متعدٍ، كشف حلقات، يرمي عند مرجع مفقود (لا يعيد السلسلة صامتاً — Canvas سيبتلعها لوناً غير صالح ويحتفظ بآخر قيمة). يُطبَّق مرة واحدة قبل الرندر، لا داخل الطبقات
- ☑ `loadBrandFonts` عبر `FontFaceSet` — `FontLoader` قابل للحقن على نمط Measurer، مع `createGatedMeasurer` يرمي إن استُدعي القياس قبل الجاهزية (تنفيذ ADR-006 اختبارياً)
- ☑ **الدالة قائمة** — `detectFontCaps` مُنفَّذة في `packages/engine/src/text/kashida.ts` وتقيس U+0640 وتعيد `{kashida:boolean}`.
- 📎 **الاستدعاء عند الرفع** — مؤجَّل للمرحلة 4 (يحتاج واجهة رفع الخط في Studio).

## الطبقات
- ☑ تفكيك `cvRenderInto` إلى مفسّر طبقات — **مُنجَز** بـ`renderFrame` في `packages/engine/src/render.ts` (المرحلة 2).
- ☑ `image` — `layers/image.ts` (cover + crop اختياري، من `cvDrawCover`)
- ☑ `solid` — `layers/solid.ts` (لون من `brand.colors[colorKey]`)
- ☑ `gradient` — `layers/gradient.ts` (shape/band من `brand.gradient`، top/bottom/center، من `cvGradient`)
- ☑ `accent` — `layers/accent.ts` (`drawAccentBar` + `drawAccentSpan` من `brand.colors.accent`، ارتفاع من `brand.typography.accentBar.height`)
- ☑ `badge` — `layers/badge.ts` (كل القياسات من `brand.badges.urgent`، مسار مستدير عبر `roundRect` مع تراجع `arcTo`)
- ☑ `logo` — `layers/logo.ts` (حجم/هامش/موضع من `brand.logo` مع حراسة صامتة عند غياب الصورة)
- ☑ `watermark` — **مُنجَز** كدَين المرحلة 2 (السطر 251): يرسم صورة شعار مقياساً/إزاحة/شفافية بحسب `brand.logo.watermark`. التلوين (tint) بـcomposite operations يبقى مؤجَّلاً حتى أول عميل بشعار حقيقي.
- ☑ `headline` · `kicker` · `source` — **مُنجَزة** ضمن `renderFrame` (المرحلة 2) وسطور دَين المرحلة 2 المُحسَم (249–255): headline يستعمل `wrapOptimal`/`layoutBalanced`؛ kicker منفَّذ في `render.ts` مع `RenderState.kicker`؛ source منفَّذ بـ`drawLineRTL`.

## الربط
- 📎 الواجهة الحالية تعمل فوق المحرك الجديد بلا تغيير مرئي — **مؤجَّل للمرحلة 2/4** (تعتمد على مفسّر القوالب + Next.js Studio). لا يحجب بوابة المرحلة 1 لأن البوابة عن الفصل، لا التكامل مع الأداة القديمة.
- 📎 حذف `cvCtx` و `CVW` و `CVH` — سيحدث آلياً عند حذف `reference/aa-media-kit.html` من المسار التجاري (المرحلة 2 عند نضج القوالب البديلة).
- 📎 حذف `getElementById` — نفس الملاحظة.
- 📎 لقطات مرجعية للقوالب الأربعة — تنتقل إلى المرحلة 2 (تصبح لقطات JSON، لا HTML).

**البوابة (مُتحقّقة 2026-08-31):**
1. ☑ **تشغيل الأداة بهويتين مختلفتين دون لمس كود الرسم.** الإثبات: `brands/client-demo.json` (طيف — Almarai، أزرق غامق/عنبر، شارة "خبر عاجل")؛ `pnpm preview -- --brand=default` مقابل `--brand=client-demo` أنتج مخرجَين مختلفَين تماماً (fs 74 مقابل 66، boxW 950 مقابل 929، ألوان وخط وشارة مختلفة). `git diff HEAD packages/` = **صفر تغيير** — الفصل مُثبَت آلياً بأداة git لا بادّعاء.
2. ☑ «مؤتمر Brussels للسلام» يظهر بترتيب صحيح — اختبار BiDi نجح.
3. ☑ `DEFAULT_BRAND` يُنتج بطاقة صالحة — `preview-default.png`.
4. ☑ لا `document` في `packages/engine` — فحص `scripts/check-engine-purity.mjs` في CI (يعمل عند كل `pnpm test`).

---

# المرحلة 1.5 — الكشيدة (مكتملة)

**قُدِّمت من المرحلة 3.5 بقرار المالك (2026-08-31).** لافتة المنتج التنافسية —
لا يستحق الانتظار خلف قوالب/رندر/طوابير.

## المكوّنات
- ☑ `packages/engine/src/text/kashida.ts` — `kashidaSites`، `pickDistributedSites`، `justifyLine`، `estimateLineCapacity`، `detectFontCaps`، `TATWEEL`.
- ☑ قواعد لغوية إلزامية: لا بعد `ا د ذ ر ز و` + همزات + ة + ٱ · لا قبل حرف نهائي · أيّ تشكيل ⇒ تراجع كامل · كلمات < 3 حروف مُستبعدة.
- ☑ `justifyLine`: توزيع round-robin عبر الكلمات · احترام `maxStretchPerSite` و `maxSitesPerWord` · تراجع صامت عند `!fontCaps.kashida` أو `mode !== kashida/hybrid` أو آخر سطر بـ `lastLine='natural'`.
- ☑ `minLineFill` تعني «ملء بعد الكشيدة» (لا خام) — بدون هذا يظهر التصادم بين قبول wrap وحرس justifyLine.
- ☑ `detectFontCaps`: يقيس U+0640؛ عرض < 5% × fs ⇒ `kashida:false` تلقائياً.

## القيود الجديدة
- ☑ `brand.typography.breaking.headlineFsRatio = [0.065, 0.085]` — النطاق الصحفي المفضّل.
- ☑ `brand.typography.breaking.boxWidthRange = [0.72, 0.88]` — عرض الصندوق نطاق لا ثابت.
- ☑ `wrapOptimal` يستكشف (fs, boxWidth, k) داخل النطاقين، ويقبل حسب post-kashida fill ≥ 0.82.
- ☑ `WrapResult.boxWidth` يحمل العرض المُختار للمستدعي.
- ☑ `estimateLineCapacity` مصدر واحد للحقيقة يستعمله wrap و justifyLine.

## المعاينة الدائمة
- ☑ `scripts/preview.mjs` يخرج `out/preview.png` (كشيدة) + `out/preview-nokashida.png` (مرجع).
- ☑ الإعداد المعتمد على النصّ التجريبي (1080×1350، 11 كلمة): fs=74 (6.9%)، boxW=950 (88%)، 3 أسطر — السطر 1 يبلغ 100% بتطويل واحد، السطر 2 يبلغ 90% بثلاث تطويلات موزّعة، السطر الأخير 73% طبيعي.

## البوابة (متحقّقة)
1. ☑ سطر مبرَّر بحافة يسرى مستقيمة عند fs ضمن النطاق المقروء (6.9% من عرض القماش).
2. ☑ التوزيع فعلي: لا كلمة تحمل أكثر من `maxSitesPerWord` تطويل.
3. ☑ تراجع صامت مؤكَّد اختبارياً عند خط لا يدعم أو مود `space/none`.
4. ☑ ما لا يعمل في أي متصفح — يعمل هنا (خنق تنافسي مباشر ضد Canva/Figma/…).

## دَين مقصود (مقبول)
- المسار (ب) محاور التطويل المتغيرة (LTAT/RTAT) و(ج) HarfBuzz + فرع التبرير — يبقيان في المرحلة 3.5 عند الحاجة إلى جودة أعلى لخطوط بعينها. المسار (أ) الحالي كافٍ للعميل الأول.

**دَين المرحلة 2 المكتشف عند إغلاقها ثم المُحسَم في نفس اليوم:**
- ☑ منفّذ `kicker` — نصّ سطر واحد بوزن مختلف من `brand.typography.kicker`، يُخزّن bounds في `RenderState.kicker` لاستعمال accent/headline لاحقاً.
- ☑ منفّذ `accent` — ثلاثة أوضاع: `underline` (خط تحت الكيكر أو العنوان)، `above-first-line` (شريط قصير فوق أول سطر عنوان)، `span` (شرائط تحت الكلمات المُعلَّمة `_word_` باستعمال accent bounds المُرجَعة من `drawLine*`).
- ☑ منفّذ `watermark` — يرسم صورة شعار مقياساً/إزاحة/شفافية بحسب `brand.logo.watermark`. تراجع صامت عند غياب الصورة. **دَين مؤجَّل داخل الدَين:** التلوين (tint) بـcomposite operations — يُنفَّذ عند أول عميل بشعار حقيقي.
- ☑ `normalizeHeadlineFont` في `render.ts` — تكوينات الخط الأخرى (headline, title3l) تحمل max/min/lineHeight/boxWidth فقط؛ knobs التخطيط تُوَرَّث من `brand.typography.breaking`. تفادى توسيع كل تكوين في shared.
- ☑ `TypographyReelTitle` وسّعت في shared لحمل knobs التخطيط الكاملة (reel له قيم مختلفة، فتوريث من breaking غير مناسب).
- ☑ `HeadlineAnchor` وسّع بـ`below-kicker` — يقرأ `RenderState.kicker.bottom + gapBelow`.
- ☑ `KickerLayer.verticalAnchor` (اختياري، افتراضي 0.4).

---

# المرحلة 2 — القوالب بيانات

- ☑ JSON Schema للقالب + مُتحقق يُستدعى وقت التحميل (`packages/templates/src/{schema,validate}.ts`). المتحقق يدوي بلا Ajv (شجرة تبعيات نظيفة)، ينشر SCHEMA كبيانات لمن يريد ajv خارجياً.
- ☑ تحويل `card_centered` (JSON، يمرّ التحقق — الرندر مؤجَّل حتى تصبح accent/kicker مدعومة).
- ☑ تحويل `card_bottom` (JSON، يمرّ التحقق).
- ☑ تحويل `card_kicker` (JSON، يمرّ التحقق).
- ☑ تحويل `breaking` (ثابت — يُرسم بالكامل عبر `renderFrame`). فرع الفيديو (`kind: video`) مؤجَّل للمرحلة 3.
- ☑ تحويل `reel` (JSON، يمرّ التحقق — clipstream مؤجَّل).
- ☑ **مفسّر الطبقات** `packages/engine/src/render.ts` — `renderFrame({ctx, size, template, brand, content, assets})` يقرأ layers بالترتيب ويدعم `onlyIf` و `fallback` recursive و RenderState للتتبّع المتقاطع.
- ☑ `onlyIf` (hasImage · isSquare · isPortrait) و `fallback` — منفَّذان.

**البوابة:** ☑ **مُتحقّقة 2026-08-31.** `packages/templates/src/templates/plain.json` (قالب خامس: solid + headline + logo) رُسِم بكل من `--brand=default` و `--brand=client-demo` عبر `pnpm preview -- --template=plain` — صفر سطر جديد في `packages/engine`. `pnpm verify:snapshot` يقارن preview-default.png و preview-client-demo.png بايت-بايت مع `snapshots/*.png` — كل الجولات مطابقة.

---

# المرحلة 3 — الرندر على الخادم

## النواة
- ☑ `apps/renderer` بـ Node + `skia-canvas` — **مُنجَز** (`apps/renderer/src/index.ts`، السطر 286).
- ☑ `pnpm render:mp4` من CLI ← **اختبار صحة المعمارية كلها** — مُنجَز (السطر 289). `render:png` غير مطلوب مستقلاً بعد أن أثبت `render:mp4` نفس المعمارية (كل إطار = نداء `drawAt`).
- 📎 مقارنة بكسلية: Node مقابل المتصفح (فرق ≤ 1%) — **يُرفع مع تنفيذ الواجهة في المرحلة 4** (لا وجود لواجهة متصفح تُقارَن بها اليوم).
- ☑ `timelineOf(template, brand, content)` — `packages/engine/src/timeline/timeline.ts`. المعادلة: `max(motion.segmentMin, min(motion.segmentMax, motion.segmentMin + max(0, n − motion.segmentWordBase) × motion.segmentWordStep))` + outro. كل الثوابت من `brand.motion` (لا مثبتات).
- ☑ حلقة `drawAt(t = f/fps)` — `packages/engine/src/timeline/draw-at.ts`. دالة خالصة من الزمن إلى إطار مع دعم fade + slideY + stagger (per-line للـheadline) + pulse (للـbadge) + outro fade-to-black. **اختبار النقاء الحاسم:** استدعاء بترتيب عشوائي `[5.7, 0.30, 7.0, 0, 2.0, 1.0]` يعطي نتائج مطابقة للاستدعاء المتسلسل `[0, 0.30, 1.0, 2.0, 5.7, 7.0]` — 7 اختبارات vitest أخضر.
- ☑ 8 دوال easing — `packages/engine/src/timeline/easing.ts`: linear + Quad {In,Out,InOut} + Cubic {In,Out,InOut} + easeOutBack.
- ☑ فرع `kind: video` في breaking — `template.video.animation` بترتيب (badge at 0 مع pulse) → (headline at 0.30 مع stagger من brand.motion.lineStagger و fade من lineFade و slideY 26) → (source after headline مع fade 0.35). outro من brand.motion.outro. easing = easeOutCubic.

## الأنبوب (ADR-008)
- ☑ `skia-canvas → getImageData → Buffer RGBA خام → FFmpeg stdin (-f rawvideo -pix_fmt rgba -i pipe:0)` — `apps/renderer/src/index.ts`. `stdin.write` مع انتظار `drain` لتفادي ضغط الذاكرة. `on('close')` يلتقط رمز الخروج.
- ☑ **لا ملفات إطارات مؤقتة على القرص** — النواة تجدّد Canvas واحداً وتمسحه (`ctx.clearRect`) قبل كل إطار. صفر I/O على disk بين الإطار وحرف FFmpeg.
- ☑ H.264 (`libx264`) + `yuv420p` + `+faststart` + AAC 128kbps + `color_primaries bt709` (≈ sRGB) + `-shortest` مع anullsrc.
- ☑ `pnpm render:mp4 -- --brand=default --template=breaking` — يشغّل apps/renderer/src/cli.ts. الاختبار: 252 إطاراً × 1080×1350 → 118KB MP4 في **~2.2 ثانية** (بعد إصلاح 2026-08-31 عبر `RenderPlan` — كان 177 ثانية قبل الإصلاح؛ التسارع ×80 على المخرج الحقيقي، ×471 على زمن الإطار ذاته). MD5 مطابق لما قبل الإصلاح — الأداء تغيّر، المخرج لم يتغيّر.

## الطوابير — الجلسة الثانية للمرحلة 3 ☑ (2026-08-31)
- ☑ **BullMQ 5.34 + ioredis 5.4 + Redis 8.10.1** (على قاعدة `/3` معزولة + بادئة `pf-mediakit` — الميني يشترك Redis مع منهاج/PrimeMind، هذا يمنع الاختلاط)
- ☑ **أربعة طوابير** — `render-urgent` (2 عمال، مهلة 30s) · `render-normal` (`floor(cores/2)`، 3 دقائق) · `render-edit` (**1 عامل فقط**، 10 دقائق) · `render-batch` (1، بلا مهلة)
- ☑ `WORKER_NORMAL` من متغير البيئة، الافتراضي `floor(cores/2)` — على الميني M4 (8 أنوية) = 4، على أنوية أعلى/أقل ينضبط تلقائياً
- ☑ **حصة عادلة على tenantId عبر آليتين:**
  - **الأولوية عند الإدخال:** `priority = 1 + (عدد المهام المنتظرة لنفس tenantId) × 10`. BullMQ يسحب الأدنى أولاً، فمهام مستأجر بلا طابور تسبق مستأجراً محتقناً — round-robin طبيعي بلا مخطّط مخصص
  - **cap مطلق per tenant عند التنفيذ:** `ceil((urgent+normal concurrency)/2)`. INCR/DECR في Redis حول `renderVideo`. تجاوز الـcap ⇒ DECR + رمي خطأ فيُعاد الجدولة
- ☑ **التحقق قبل الطابور** — `apps/renderer/src/validate.ts` يرفض قبل `queue.add`: template غير معروف، tenantId مفقود، size خارج [320, 4096]، content ليس object، brand غير محلول، المدة المتوقعة > 90s. المهام المعطوبة لا تلمس Redis أصلاً
- ☑ **تنظيف في `finally`** — DECR عدّاد tenant مهما كانت النتيجة (fail/success/timeout). الأنبوب المباشر يزيل ملفات الإطارات (session 1 ADR-008)
- ☑ **مهلة per-queue** بـ`Promise.race` — BullMQ 5 لا يوفّر مهلة per-job built-in

## بوّابات الجلسة الثانية — مُتحقّقة ✅

**اختبار الذروة (`scripts/test-peak-load.mjs`):** 9 مهام urgent متزامنة، 3 مستأجرين × 3 مهام لكلٍّ، بترتيب round-robin عند الإدخال.
- كل المهام اكتملت (9/9)، صفر فشل
- **أقصى wait قبل البدء: 15.13s** (البوابة: ≤ 45s — عبرت بهامش 66%)
- متوسط wait: 6.63s
- نمط round-robin واضح في السجل: `A→B→C→A→B→C→A→B→C`

**اختبار عزل الفشل (`scripts/test-isolation.mjs`):** 8 حالات معطوبة + مهمة صحيحة.
- 8/8 مهام معطوبة رُفضت **قبل** الطابور برسائل تشخيصية دقيقة (`[templateId] غير معروف: nonexistent`، `[size] الأبعاد يجب أن تكون في [320, 4096]`، إلخ)
- صفر تسرّب إلى Redis (`waiting=0 قبل = 0 بعد`)
- مهمة صحيحة معالَجة بعدها في 1.60s — الطابور نظيف

## المتصفح
- 📎 `WebCodecs` للفيديو القصير بلا مصدر خارجي — **مؤجَّل للمرحلة 4** (يُرفع مع الواجهة).
- 📎 الخادم كتراجع (دعم Safari ناقص) — **مؤجَّل للمرحلة 4**، تابع لبند WebCodecs أعلاه.
- 📎 **حذف `MediaRecorder` نهائياً** — لا يوجد في المستودع أصلاً (وُلد المحرك التجاري بلا `MediaRecorder`)

**البوابة (الجلسة الأولى — مُتحقّقة 2026-08-31):**
1. ☑ **MP4 يُشغَّل على macOS** — H.264 + yuv420p + AAC + MP4 container. اختُبر بـ`ffprobe`.
2. ☑ **المدة تطابق `timelineOf`** — 8.40 ثانية بالضبط لـ11 كلمة.
3. ☑ **الإطار عند t=1.4 يطابق لقطة ثابتة** — `scripts/verify-frame-at.mjs`.
4. ☑ **الأداء (بعد RenderPlan):** فيديو 8.4s ⇒ 2.2s رندر (×80 من 177s). فيديو 60s يُستقرأ ~15s (يتجاوز الالتزام 5 دقائق بأريحية).

**البوابة (الجلسة الثانية — مُتحقّقة 2026-08-31):**
5. ☑ **معيار الذروة:** 9 مهام urgent متزامنة (3 مستأجرين × 3) → أقصى wait 15.13s (البوابة ≤45s). كل المهام اكتملت، صفر فشل. round-robin واضح `A→B→C→A→B→C→A→B→C`.
6. ☑ **عزل الفشل:** 8/8 مهام معطوبة رُفضت قبل الطابور (`waiting=0 قبل=بعد`). مهمة صحيحة معالَجة في 1.60s بعدها. `apps/renderer/src/validate.ts` هو نقطة الرفض الوحيدة.
7. ⏸ **مؤجَّل للمرحلة 4:** MP4 يُشغَّل على iPhone/أندرويد ويُرفع لإنستغرام بلا تحويل — يحتاج جهاز عميل حقيقي للتحقق النهائي.

## تبعية نظام
- 📎 **ffmpeg 9.0.1** (`libx264` + `aac` + `videotoolbox` للترميز العتادي) — تبعية نظام مطلوبة على كل بيئة تشغيل. مثبَّتة على الميني عبر Homebrew. **يجب تثبيتها على VPS الإنتاج أيضاً.** النسخة المرجعية 9.0.1 — الأقدم قد لا يدعم بعض الـcolor primaries الحديثة.

---

# المرحلة 3.2 — لوحات التحكم ☑ (2026-09-02)

عملاء من خلفية الجزيرة يحتاجون رؤية وثقة لا مرونة فعلية (docs/08 §المبدأ).
الشفافية تُشترى؛ الانتظار المعروف مقبول والمجهول مرفوض.

**اندماج فرع `feat/dashboards` في main** — البنية والدروس مذكورة أدناه؛
التفاصيل الكاملة كانت في `PHASES-dashboards.md` (حُذف بعد الدمج).

## البنية

- **طبقة قراءة خالصة:** `apps/renderer/src/observe.ts` — 8 دوال
  (queueDepth، activeJobs، jobPosition + expectedStartSec، tenantJobs،
  failureRate، resourceUsage، tenantDistribution، systemStatus بـreasonKey).
  لا تعديل على `queues.ts` أو `worker.ts` (مقفلان على main).
- **لوحة العميل** `/client` — «مهمتك رقم N — تبدأ خلال Xث» أو «مهمتك تعمل
  الآن — Y٪». polling كل 3s. سجل التصديرات والاستهلاك مُخفيان حتى PostgreSQL.
- **لوحة التشغيل** `/ops` — طوابير + مهام نشطة + فشل + موارد + توزيع +
  إجراءات إدارية.
- **REST خفيف:** `/api/client`, `/api/ops`, `/api/ops/action`.
- **`apps/dashboard/`** — Next.js 14 على منفذ 19030.
- **بذرة تنبيهات** `apps/renderer/src/alerts.ts` — webhook + de-dup في Redis
  (SET NX EX). عتبات: قرص>80% · طابور>10 · عامل معلّق>5د · فشل مهمة.
  `runAlertCycle()` جاهز، ينتظر ربطاً بمصدر تنفيذ (cron/repeat).

## نظام اللغات — الأوضاع الثلاثة (ar / mixed / en)

نظام i18n خفيف بلا مكتبة: كائن مفاتيح + Context + `t()` + interpolation
(`{pct}` · `{n}`). أولوية القراءة: `?locale=X` → localStorage → `ar`.
`LocaleSwitcher` في الرأس، `<html dir/lang>` عبر effect. مكوّن `<Ltr>`
يغلّف المركّبات الرقمية بـ`dir="ltr"` (يعالج قلب `108.0 / 460.4 GB`).

**قاعدة الوضع المختلط — المصححة (L-24، تُغلّب المسوّدة الأولى):**
الخلط على مستوى **الوحدة الدلالية المستقلة**، لا داخل الجملة الواحدة.

- **يبقى بالإنجليزية في mixed** (وحدات قائمة بذاتها فقط): أسماء الطوابير
  (Urgent · Normal · Edit · Batch)، حالات المهمة (Active · Waiting · …)،
  أعمدة تقنية (ID · Template · Tenant)، أسماء المتغيرات (WORKER_COUNT).
- **يبقى بالعربية كاملاً في mixed** (بلا كلمة إنجليزية داخل الجملة): كل
  الجمل والعبارات والعناوين والأزرار وحالة النظام. مثال: خليّة الحالة
  تعرض `Active`، لكن الجملة تقول «مهمتك قيد التنفيذ» لا «مهمتك Active».
- **المقياس الوحيد:** اقرأ النص بصوت عالٍ. إن بدا هجيناً — فهو خاطئ.

## الحفظ (الآن ولاحقاً)

- **الآن:** `localStorage['pfmk.dashboard.locale']` + `?locale=X`.
- **متطلَّب مسجَّل للمرحلة 4:** إضافة `brand.locale: 'ar'|'mixed'|'en'`
  إلى `packages/shared/src/brand-kit.ts` (الافتراضي `'ar'`). يُقرأ عبر
  `/api/client` ويستعمل كافتراضي بدل ثابت. localStorage يبقى override
  يدوي على مستوى المتصفح.

## الإجراءات الإدارية (بلا لمس worker.ts)

| الإجراء | يعمل |
|---|---|
| حذف مهمة waiting/delayed | ✅ `Queue.getJob(id).remove()` |
| حذف مهمة نشطة | ❌ يتطلب token — نُرجع 409 |
| إيقاف/استئناف طابور | ✅ `Queue.pause()/resume()` |
| تفعيل/إنهاء الصيانة | ✅ علم Redis + pause كل الطوابير (L-21) |
| تعيين `WORKER_COUNT` | ◐ يُخزَّن في Redis، يتفعّل بإعادة تشغيل يدوية |

## البوابات — مُتحقّقة (2026-09-02)

| البوابة | المعيار | القياس |
|---|---|---|
| دقة التقدير | \|خطأ\| ≤ 30% | **وسيط 3.6%** (`scripts/dashboard-eta-check.mjs`) |
| اختبار الذروة | 9 مهام متزامنة، wait ≤ 45s | **9/9 مكتملة، أقصى wait 12.10s** |
| كل الاختبارات | vitest أخضر | **266/266** (بما فيها 5 اختبارات observe.test.ts) |
| verify:snapshot | 24/24 لقطة | **24/24** مطابقة |
| لقطات بصرية | دوران السِيَر واللغات | **6 لقطات ops/client + 6 لقطات ar/mixed/en** في `apps/dashboard/screenshots/` |

**ملاحظة:** الرقم 273 المذكور في `PHASES-dashboards.md` قبل الدمج
انخفض إلى 266 بعد حذف اختبارَي legacy timeline في تنظيف المرحلة 3.7 —
لا انحدار في وظائف dashboards؛ الاختبارات الخمسة لـobserve.test.ts سليمة.

## دَين مقصود (يُعالَج في المرحلة 4)

- **سجل التصديرات + الاستهلاك:** ينتظران **PostgreSQL** — البطاقات
  مُخفيّة في /client حتى تصل البيانات الحقيقية.
- **`brand.locale` في brandKit:** الحفظ الحالي في localStorage فقط —
  في المرحلة 4 يُخزَّن مع هوية العميل، وتصبح lucaleSwitcher قرار brandKit
  لا قرار متصفح.
- **إعادة تشغيل العامل تلقائياً:** يتطلب Redis pub/sub في worker.ts
  (مقفل على main حينها). المسار الحالي: يدوي.
- **قتل مهمة نشطة:** يتطلب token من العامل. 409 مع رسالة توجيهية.
- **ويب هوك التنبيهات:** جاهز، ينتظر ربطاً بمصدر تنفيذ (cron أو BullMQ
  `repeat`).

## القيد الحاكم — الفرع لم يلمس أيّ ملف مقفل

`queues.ts` · `worker.ts` · `validate.ts` · `renderer/index.ts` ·
`renderer/cli.ts` · كل `packages/**` (بما فيه timeline v1 السابق و
timeline v2 اللاحق) — كلها بلا تعديل من فرع dash. التعديلات على الجذر
كانت إضافات غير-تدميرية فقط: `apps/renderer/package.json` (exports)،
`vitest.config.ts` (include `apps/**/*.test.ts`)، `.gitignore`
(`.next/`, `next-env.d.ts`).

---

# المرحلة 3.5 — الخندق التنافسي (المتبقّي)

**الكشيدة انتقلت إلى المرحلة 1.5** (مكتملة). ما بقي هنا:
- الكسر الدلالي (لا قسمة داخل وحدة معنى).
- التشكيل الآلي مع lineHeight ديناميكي.
- لقطة مقارنة مع Canva — أداة البيع.

## الكسر الدلالي

### الجزء (أ) — القوائم المغلقة (2026-09-01 ✅)
- ☑ `rulePenalty` — حروف الجر، الموصولات، ناسخات، جوازم، نافيات، عطف
- ☑ `wrapOptimal` يستقبل `breakPenalties` مصفوفة جاهزة (L-07: تُحسب مرة)
- ☑ اختيار أقل كلفة إجمالية (rulePenalty + كلفة uniform)
- ☑ ترتيب الفحص «الأخصّ قبل الأعمّ» (compound-name قبل inseparable) — L-08

### الجزء (ب-1) — الدمج مع wrap + cache القياس (2026-09-01 ✅)
- ☑ `LineMeasureCache` في wrapOptimal — تحسّن ×3.7 حتى مع الدلالي مُعطَّلاً
      (docs/LESSONS L-09: التحسين المعماري يخدم كل المسارات، لا مساراً واحداً).
- ☑ 213 اختبار vitest أخضر · 12/12 snapshot · صفر انخفاض في fs المختار.
- 📎 دَين 128ms مقبول — البوابة 50ms كانت تقديراً بلا أساس (L-05).

### الجزء (ب-2) — الموارد الخارجية + التفعيل الافتراضي (2026-09-01 ◐)
- ☑ **GeoNames** (CC-BY-4.0) → `data/external/places.json` — 3,146 اسماً،
      2,140 مركّب، 72 KB. المدن ≥15K + العواصم + الدول + أولوية للأسماء
      المركّبة في السياق الإخباري (بيت لحم، رأس الخيمة، دير البلح…).
- ☑ **Wikidata SPARQL** (CC0) → `data/external/entities.json` — 2,659 كياناً
      مركّباً، 113 KB (منظمات دولية، هيئات، أحزاب، إعلام، جامعات، أندية
      عربية + عالمية كبرى).
- ☑ **titles.json** يدوي — 155 لقباً، 3 KB.
- ☑ `ExtendedLexicon` في `arabic-lexicon/extended.ts` — فهرسة أزواج
      الكلمات المتجاورة داخل أسماء الأماكن/الكيانات، O(1) لكل استفسار DP.
- ☑ ثلاث قواعد جديدة في `semantic-break.ts` (place-pair · entity-pair ·
      title-name) — كلها BREAK_STRONG (1000)، تسبق compound-name القديمة.
- ☑ 13 اختبار جديد للقواعد الموسَّعة (المجموع 226 اختباراً أخضر).
- ☑ `ATTRIBUTIONS.md` — إسناد GeoNames + Wikidata.
- 📎 **WojoodGaza غير محمَّل** — يحتاج نموذج طلب أكاديمي عبر sina.birzeit.edu.
      البوابتان (أ) و (ب) **معلَّقتان** حتى وصوله. لا تُغلَق المرحلة قبل ذلك.
- ☑ **DEFAULT_BRAND.typography.semanticBreaks.enabled = true** — بوابات (ج، د،
      أداء) تبرّر التفعيل الافتراضي؛ (أ، ب) تخصّ الدقّة لا السلامة.
- ☑ `snapshots-semantic/` — 12 لقطة enabled=true (6 قوالب × 2 هويتين).
- ☑ `snapshots/` تبقى كما هي (enabled=false) — مرجع توافق خلفي.
- ☑ `pnpm verify:snapshot` يقارن 24 لقطة (12 لكل وضع) — كلها اجتازت.
- ☑ `out/preview-semantic.png` و `out/preview-nosemantic.png` — للمراجعة البصرية.

### البوابات (المقاسة 2026-09-01)

| بوابة | معيار | قياس فعلي | حكم |
|---|---|---|---|
| أ | صفر كسر داخل فئة Infinity | — | ⏳ معلَّق (WojoodGaza) |
| ب | ≥70% انخفاض في كسور فئة 1000 | — | ⏳ معلَّق (WojoodGaza) |
| ج₁ | Δ ملء ≤ 5% (265 عنوان RSS) | **+0.56%** | ✓ |
| ج₂ | Δ انحراف الأطوال ≤ 5% (RSS) | **-0.26%** | ✓ |
| د | تراجع softness ≤ 3% (RSS) | **2.26%** | ✓ |
| ⏱ | buildRenderPlan p95 ≤ 800ms مع القوائم | **402ms** | ✓ |

**بوابتا الأداء والجودة الطباعية مُتحقّقتان.** بوابتا التصنيف الدلالي
تنتظران WojoodGaza — القياس هناك يميّز بين «الكسر داخل رابطة نحوية»
(الذي تمنعه القاعدة) و«الكسر عند حد رابطة» (الذي تسمح به). RSS لا يميّز
لأنه بلا وسم كيانات.

### التصنيف النهائي لتغييرات التقسيم على 265 عنوان RSS (2026-09-02)

بعد تصحيح مصنّف `find-demo-candidates.mjs` (تجريد الكشيدة قبل المقارنة
+ إضافة idafa/bare-bare/neutral إلى knownRules — درس L-11):

```
identical         : 230
visual-only       :  12   (نفس word-to-line، اختلاف boxW/كشيدة فقط — لا تغيّر دلالي)
genuine-reflow    :  23   (تعيين word-to-line تغيّر فعلاً)
```

**توزيع الـ23 حسب القاعدة:**

| القاعدة | العدد | العقوبة |
|---|---|---|
| particle    | 13 | BREAK_INFINITY |
| bare-bare   |  5 | BREAK_MEDIUM (400) |
| place-pair  |  2 | BREAK_STRONG (1000) |
| number      |  2 | BREAK_INFINITY |
| title-name  |  1 | BREAK_STRONG (1000) |
| idafa       |  0 | — |
| unknown     |  0 | — |

**كل قرار كسر مُحدَّد بقاعدة موثّقة في `semantic-break.ts`.** لا حالة
بلا سبب معروف. الظاهرة الأولى (12 «unknown») كانت خطأً في المصنّف لا
في النظام — L-11.

## التشكيل (2026-09-02 ☑)

- ☑ **خدمة معزولة** في `services/diacritizer/` — FastAPI + arabic-
      diacritizer (MIT، v1.0.0، 18MB نموذج، ~2GB torch). منفذ 19080
      من نطاق pf-mediakit. Python 3.10-3.12 في venv خاصّ.
- ☑ **صفر بايثون داخل `packages/engine`** — تحقّق مُثبَت آلياً بـ
      `pnpm check:engine-purity` (يمرّ). التكامل على مستوى النص فقط:
      preview.mjs (وقريباً apps/renderer) يستدعي الخدمة عبر HTTP قبل
      تمرير `content.headline` لـ`renderFrame`.
- ☑ `measuredLineHeight` في `packages/engine/src/text/dynamic-line-
      height.ts` — يحسب من `actualBoundingBoxAscent + Descent`، مع
      `safetyPad=0.05`. يُعيد `max(minLineHeight, measured × 1.05)`.
- ☑ `brand.typography.lineHeightMode` يُحترم في `prepareHeadline`:
      `'fixed'` (الافتراضي — snapshots ذهبية سابقة تبقى بايت-بايت
      مطابقة) أو `'dynamic'` (يفعّل القياس). **`diacritics.enabled=true`
      يفعّل dynamic تلقائياً** بغضّ النظر عن lineHeightMode.
- ☑ التفاعل مع الكشيدة مُختبَر صريحاً في `diacritics-interaction.test.
      ts` (12 اختبار جديد): كل كلمة مشكّلة ⇒ `kashidaSites=[]`،
      `justifyLine` لا يُدرج أيّ تطويل جديد.
- ☑ **تراجع صامت** عند تعذّر الاتصال بالخدمة: تحذير stderr + تمرير
      النص كما هو، لا فشل صعب (L-04).
- ☑ `brand.typography.diacritics.enabled = false` في `DEFAULT_BRAND` —
      التشكيل خيار للعميل، الأخبار العاجلة نادراً ما تُشكَّل.
- ☑ `out/preview-diacritics.png` (85KB) للمراجعة البصرية جنباً إلى
      جنب مع `preview-semantic.png` و `preview-nosemantic.png`.
- ☑ **بوابات المرحلة 3.5:** 238 اختبار vitest أخضر (12 جديد) · 24/24
      snapshot ذهبية مطابقة (nosemantic + semantic كلاهما 12/12) ·
      `check:engine-purity` نظيف — لا window/document/بايثون في المحرك.
- 📎 دمج مباشر في `apps/renderer` (خارج CLI التطوير) — يبقى للمرحلة
      4 عند بناء الواجهة، حيث الطلب المتزامن للتشكيل يتّضح مساره.
- ☑ **تدفق تحرير التشكيل مُوثَّق** في docs/09 §«التشكيل — العميل يملك
      القرار» و docs/04 §«المحتوى». النموذج مساعد لا سلطة؛ العميل يحرّر
      حرفاً بحرف في حقل نصي، والنص المشكَّل المحرَّر هو ما يُخزَّن.
- ☑ **تشكيل جزئي مُثبَت آلياً** — 4 اختبارات جديدة في `diacritics-
      interaction.test.ts` تفحص عنواناً بكلمة مشكّلة وأربع عاريات:
      parseTokens يحفظ العلامات · kashidaSites قرار لكل كلمة · justifyLine
      لا يمدّ المشكّلة · measuredLineHeight يعكس الأعلى. **المجموع: 242
      اختبار vitest أخضر.**

## البيع
- ☐ **لقطة مقارنة: مخرجك مقابل Canva لنفس العنوان** — أداة البيع الأولى

**البوابة الشاملة للمرحلة 3.5:** عنوان عربي بلا كسر داخل وحدة معنى، مع
تشكيل اختياري لا يتصادم مع السطر الأعلى. (الحواف المستقيمة صارت مسؤولية
المرحلة 1.5.) **الحالة (2026-09-02):** الكسر الدلالي ب-2 مُتحقّق على
المقاييس الطباعية (ج، د، أداء) — بوابتا (أ) و (ب) معلَّقتان حتى
WojoodGaza. التشكيل الآلي **مُنجَز** (خدمة معزولة + dynamic lineHeight
+ تفاعل صحيح مع الكشيدة). المرحلة تبقى **◐** حتى وصول WojoodGaza.

---

# المرحلة 3.7 — محرّك الخط الزمني ☑ (2026-09-02)

**قرار المالك (2026-09-02):** المرحلة تُغلَق على **المحرك** — **واجهة**
الخط الزمني تنتقل إلى المرحلة 4. السبب: هي جزء من واجهة المنصة، وبناؤها
منفصلة يعني بناءها مرتين. المواصفة الأصلية في `10-timeline-editor.md`.

**مسار الرسم الوحيد الآن:** `drawTimelineAt` — @legacy `drawAt`/
`timelineOf`/`parseAnimations` حُذفت (2026-09-02) بعد إثبات التكافؤ
253/253 إطاراً ومطابقة md5 لبريكينغ فيديو. `templateToTimeline` هو
الجسر لأي قالب موروث.

## نطاق المُنجَز

- **النموذج** (`packages/shared/src/timeline-types.ts`): Timeline · Track ·
  TrackItem · Keyframe · Transition · ActiveState.
- **النواة** (`packages/engine/src/timeline/`): `resolveAt` · `interpolate`
  (8 دوال تسهيل) · `drawTimelineAt` خالصة زمنياً.
- **الخطة** `buildTimelinePlan`: تحضير النصوص مسبقاً (L-07) + فحص تصادم
  التوقيت/الموضع بين عناصر النص (L-16).
- **مسار الوسائط** (§ب): trimIn · trimOut · speed · crop + `kenBurns`
  (9 نقاط أصل).
- **مسارات النص** (§ج): نصوص متعددة بتوقيتات مستقلة · مفاتيح لـopacity/
  x/y/scale/rotation · **`byWord` RTL** من اليمين · كسر السطور من
  buildTimelinePlan · الكشيدة ثابتة عبر الإطارات (مُثبَت md5).
- **الانتقالات** (§د): 5 انتقالات — crossfade · slide · wipe · zoom · blurIn
  — مع `direction: 'rtl'|'ltr'|'auto'` (auto يقرأ brand.direction).
  نصية: **typewriter** RTL حرف بحرف (fadeUp عبر keyframes مباشرةً).
- **الصوت** (§هـ): `AudioPlan` خالصة قابلة للتسلسل · gain · fadeIn/Out ·
  loop · **ducking** بـsidechaincompress · ترجمة filter_complex في
  `apps/renderer/src/audio-ffmpeg.ts`.

## المؤجَّل بقرار المالك

- **واجهة الخط الزمني (§و)** → **المرحلة 4** — جزء من واجهة المنصة.
- **فك الترميز المسبق (§فك الترميز)** → ينتظر **مقطع مصدر حقيقي** من
  العميل الأول. لا يُبنى بعيّنة اصطناعية — قرار سابق مؤكَّد.
- **`highlightBar`** كمؤثر نصي — لم يُطلب في أي بوابة، يُضاف عند الحاجة.
- بنود § ز — مراجعة سقف المدة، ترقية الخادم، سياسة الاحتفاظ، قياس فك
  الترميز — تلحق بـ§فك الترميز.

## البوابة المحققة

مشروع بأربعة مسارات (وسائط + نصّان + صوتان) يُصدَّر MP4 بمدة مطابقة
للتوقيت، والعاجل لا يتأخر — مُغطّاة عبر البوابات المتتالية:

| البوابة | مسار | نتيجة |
|---|---|---|
| `verify-timeline-equivalence` (قبل الحذف) | breaking بايت-بايت مع @legacy | 253/253 |
| `verify-breaking-video` (بعد الحذف) | md5 مرجعي محفوظ | ✓ |
| `verify-media-track-gate` | صورتان + kenBurns → MP4 | 3/3 (perf 0.97×) |
| `verify-text-tracks-gate` | 3 مسارات + byWord + مواضع | 6/6 (perf 1.00×) |
| `verify-transitions-gate` | 3 وسائط + انتقالان + L-17 مراجعة | 5/5 (perf 1.01×) |
| `verify-audio-gate` | موسيقى + تعليق + ducking + L-17 waveform | 5/5 (ducking مرئي ورقمي) |

**العاجل لا يتأخر:** `test-peak-load.mjs` (المرحلة 3 جلسة 2) أثبت
9/9 مهام متزامنة أقصى wait 15.13s — دون التسعير 45s. لم يتأثر بتوسّع
timeline v2 (مسار عام لا يمرّ بطوابير الرندر).

## تنظيف @legacy (2026-09-02)

- ☑ حُذف `packages/engine/src/timeline/timeline.ts` (`timelineOf`، `parseAnimations`، `ResolvedAnimation` نُقلت إلى `template-adapter.ts`).
- ☑ حُذف `packages/engine/src/timeline/draw-at.ts` (`drawAt` الموروث).
- ☑ حُذف `packages/engine/src/timeline/easing.ts` (النسخة الموروثة). timeline v2/easing.ts يخدم 8 دوال جديدة.
- ☑ حُذف `scripts/verify-timeline-equivalence.mjs` — لا مرجع للمقارنة.
- ☑ حُذف `scripts/diagnose-render-perf.mjs` و `scripts/diagnose-semantic-perf.mjs` (تشخيصات تاريخية، نتائجها في L-07/L-09).
- ☑ `packages/engine/src/timeline-v2/` أُعيدت تسميتها إلى `timeline/`.
- ☑ namespace `timelineV2` أُزيل من `packages/engine/src/index.ts` — كل شيء export مباشر.
- ☑ `RenderPlan` تقلّصت إلى `{ headline?, headlineLineCount }` — لا `timeline` ولا `animations` (كلاهما مسؤولية `templateToTimeline`).
- ☑ **`snapshots-video/breaking.mp4` + `breaking.md5`** — مرجع ذهبي دائم، `pnpm verify:breaking-video` يحرسه.
- ☑ **المُوفَّر:** ~1000 سطر (400 مصدر legacy + 580 تشخيصات + 12 حرف تلوّث في references).

---

# المرحلة 3.8 — امتدادات المحرك (بعد مسح الميزات 12)

خمس امتدادات على المحرك تُبنى **قبل المنصة**، لأن كلاً منها يمسّ نموذج
البيانات أو `brandKit` أو `TrackItem` — تركها بعد المنصة يعني ترحيل
مدفوعاً بواجهة موجودة. نبنيها الآن ونعرضها CLI-first ثم تُغلَّف بالواجهة
في المرحلة 4. المرجع الكامل: `docs/12-feature-scan.md`.

## قاعدة تنفيذية إلزامية — فحص الرخصة أولاً

ثلاث من الامتدادات تعتمد نماذج/مكتبات جديدة (التفريغ · التعليق الصوتي ·
كشف الوجوه). **فحص الرخصة الخطوة الأولى في كل واحد لا الأخيرة** —
كما فعلنا مع نموذج التشكيل (MIT ✓). **تُرفض GPL و AGPL** في منتج تجاري.
Apache 2.0 · MIT · BSD مقبولة. النموذج غير المرخّص صراحةً = مرفوض.
راجع L-12 (المكوّنات غير-JS في خدمات معزولة) و ATTRIBUTIONS.md.

## البنود الخمسة

- ◐ **التفريغ + القاموس المخصّص** — خدمة `services/transcriber/` معزولة
      (Python + Whisper، منفذ من نطاق pf-mediakit)، على نمط
      `services/diacritizer/`. `brandKit.transcriptionDictionary`:
      قائمة مصطلحات العميل (أسماء مراسليه · مناطق تغطيته). المحرك
      يستقبل نصاً موقوتاً ولا يعرف من فرّغه. **فحص رخصة Whisper أولاً**
      (Whisper نفسه MIT، لكن الحزم الملفوفة مثل faster-whisper تحقّق).
      **الحالة الفعلية (جلسة main):** الخدمة تعمل بتزمين الكلمة ☑ ·
      طبقة `caption` في المحرك لم تُبنَ بعد ☐ · القاموس المخصّص لم
      يُنفَّذ ☐. البند يبقى ◐ حتى إنجاز الثلاثة معاً.

- ☑ **طبقة الإسناد (attribution)** — أُنجز 2026-09-02. الفحص القانوني
      رصد أن **خمساً من ست منصات** (Meta/YouTube/X/Telegram) تشترط إذناً
      لعرض شعارها في منتج تجاري. النتيجة معمارية:
      `brand.attribution.logoMode: 'none'|'generic'|'official'`.
      • `none` (الافتراضي في `DEFAULT_BRAND`): نصّ فقط — «تيك توك · @user».
      • `generic`: أيقونة محايدة نصمّمها (شكل هندسي بلون brandKit) — صفر مخاطرة.
      • `official`: شعار من `simple-icons` (CC0)، ملوَّن بلون brandKit،
        يشترط `brand.attribution.logoAcks[platform].licenseAck=true`
        (نمط مطابق للخط المرفوع). الرسم من مسار Path2D — لا ملفات شعار
        مشحونة في `packages/*`. الطبقة تعمل على بطاقة (renderFrame) وفيديو
        (template-adapter → template-layer). ست منصات مدعومة:
        tiktok · x · instagram · youtube · telegram · facebook. النصّ
        بنمطين (`platformNameStyle: 'ar'|'latin'`) مع عزل LRI/PDI للمقبض
        اللاتيني داخل عربي (تفادي التصاق `@` بالسياق العربي).
        **البوابة:** `pnpm preview:attribution` يصدر شبكة 6 بطاقات
        (3 modes × 2 هويّات) + 3 بطاقات منفردة + بطاقة BiDi.
        **اللقطات:** 24/24 مستقرّة (attribution ينتظر content ولا يظهر
        بدونه). وثائق: `ATTRIBUTIONS.md §شعارات المنصات` + §5 simple-icons
        + docs/03 §attribution + docs/LESSONS.md (متضمَّن في L-28 لاحقاً).

- 🔻 **Lottie / Skottie — أُعيد إلى المؤجَّل (2026-09-02)** بعد فحص
      معماري. Skottie **غير مكشوف** في `skia-canvas@3.0.8` (0 رموز في
      المكتبة النيتف). البدائل الثلاثة مرفوضة بمبرّرات مختلفة:
      - `node-canvas` كامل ⇒ يخالف ADR-001 (محرّك واحد).
      - هجين offscreen ⇒ المحاصرة تتسرّب.
      - pre-render إلى mp4 ⇒ يفقد قيمة التزامن مع الخط الزمني (يتحوّل
        إلى فيديو عادي، فيصبح العميل قادراً على تصديره من After Effects
        بنفسه بلا حاجة إلينا).

      **شرط إعادة الفتح:** إصدار جديد من skia-canvas يكشف Skottie،
      أو ربط Node آخر لـSkia. **راجع `docs/12 §4`** للتفصيل الكامل.

      **مُنجَز من هذا البند:** `fixtures/lottie/basic-shapes.json`
      (ملف اختبار من إنتاجنا للاستعمال المستقبلي) + `docs/03 §attribution.lottie`
      (مخطط licenseAck لرفع العميل في المرحلة 4).

- ☑ **SVG + محرّكنا (المسار ب) — أُنجز 2026-09-04.** المكتبات: svg-parser
      MIT · svg-pathdata MIT · svg-arc-to-cubic-bezier ISC (0 تبعيات في
      الثلاث · لا محرّك رسم ثانٍ · احترام ADR-001). طبقة
      `packages/engine/src/layers/svg.ts` (`prepareSvg` + `drawSvg`):
      يحلّل subset (path · rect · circle · ellipse · line · polyline ·
      polygon · g مع transform: translate/scale/rotate/matrix)، يفكّك
      `d=` عبر SVGPathData ويحوّل A → C عبر arcToBezier، ثمّ يرسم عبر
      أوّليات Canvas 2D (moveTo/lineTo/bezierCurveTo/…). **ربط الألوان
      بالهوية:** `data-brand-fill="accent"` و `data-brand-stroke="text"`
      يحلّان محلّ `fill=` و `stroke=` من `brand.colors[*]`. **البوابات
      الأربع (L-46):** (أ) وجود — 10 أشكال من 4 أنواع في الفيكستشر ✓
      (ب) ثبات — md5 موحّد عبر 5 استدعاءات ✓ (ج) ربط — هويّتان تعطيان
      md5 مختلفَين (`77b578…` مقابل `38b0ac…`) ✓ (د) رفض عكسي — SVG
      بألوان حرفية لا يتأثّر بالهوية ✓. **الفيكستشر:** `fixtures/svg/
      newsroom-mark.svg` (من إنتاج المشروع، بلا مصدر خارجي). **المعاينة:**
      `pnpm preview:svg` → `out/svg-demo.png` (1200×700). **البوابة:**
      `pnpm verify:svg`. **التوثيق:** ATTRIBUTIONS.md §مكتبات SVG.

- ☐ **كشف الوجوه للقصّ الذكي** — نموذج خفيف (~2MB)، الكشف يجري **عند
      رفع الصورة مرة واحدة** وتُخزَّن الإحداثيات معها (L-07 — صفر
      حساب في مسار الرندر). المحرك يستهلك قيماً جاهزة. **قرار المالك:**
      الاقتراح الآلي مع تعديل يدوي إلزامي (نفس مبدأ التشكيل — النموذج
      يقترح، العميل يقرّر). واجهة التعديل تُبنى في المرحلة 4.
      **فحص رخصة النموذج أولاً** (BlazeFace/MediaPipe/غيره — كثير منها
      Apache 2.0، لكن التحقق قبل التنزيل).

- ☐ **التعليق الصوتي — مفتاح العميل، لا نموذج مفتوح على خادمنا** —
      قرار مالك بعد الفحص: النماذج المفتوحة (Coqui XTTS · Bark · Piper)
      تحتاج GPU (خادم 150-300$/شهر) **وعربيتها ضعيفة** (النبر أعجمي،
      يهدم الغرض الإخباري). البديل: ElevenLabs · Google TTS · Azure
      بمفتاح العميل — عربية ممتازة، كلفتنا صفر. تكامل عبر واجهة
      موحّدة تخرج WAV يُدمج في `AudioPlan` كعنصر audio عادي. متسق مع
      BYO-key (المرحلة 4). راجع `docs/12 §10` و §كلفة التبعيات.

**البوابة:** كل امتداد يعمل CLI-first مع بوابة كمّية + L-17 بصري
حيث ينطبق. لا فتح للمرحلة 4 قبل اكتمال هذه الخمسة (أو تأجيل صريح
لواحد منها بحجّة قوية).

**قاعدة إغلاق المرحلة (L-45):** المرحلة 3.8 تُغلَق عند إنجاز
**الخمسة الباقية** (التفريغ · SVG · Lottie ضمن التأجيل الصريح ·
كشف الوجوه · التعليق الصوتي)، **لا عند إنجاز أولها**. حالة المرحلة
المجمَّعة = أدنى حالة بنودها، لا أعلاها. مرحلة فيها بند ☐ واحد
تبقى ◐.

**قرار معماري متكرر (L-13):** كل مخرَج نموذج **اقتراح قابل
للتحرير**، لا نتيجة نهائية. التشكيل والتفريغ والقصّ الذكي وصياغات
العنوان — نفس القاعدة.

---

# المرحلة 4 — المنصة

**النطاق موسَّع بعد مسح الميزات (docs/12):** بجانب أعمدة المنصة
التقليدية (مصادقة · مشاريع · اشتراكات)، تحمل المرحلة 4 الآن **واجهات
للامتدادات الخمسة من 3.8** + بنود جذب من مسح 12 (النماذج القابلة
للمشاركة · BYO-key · Figma/Canva · الاستضافة الدائمة).

## الأعمدة الأساسية

- ☐ `apps/studio` بـ Next.js
- ☐ مصادقة + مستخدمون + أدوار
- ☐ محرّر Brand Kit (ألوان، خط، شعار، معاينة حية)
- ☐ رفع الأصول + إقرار الترخيص مع طابع زمني
- ☐ حفظ المشاريع + سجل التصديرات مع `brand_snapshot`
- ☐ الاشتراكات (Stripe / Paddle) + الحصص
- ☐ **علامة النسخة التجريبية** — مخرجات الباقة التجريبية تحمل علامة
  مائية. موضعها الطبيعي مع الاشتراكات لأنها تعتمد على معرفة حالة
  الاشتراك. **المرجع القديم في مواصفة `docs/03`** (علامة SAMPLE
  كشارة واجهة لا طبقة رسم) يبقى كما هو حتى تُحسم البنية هنا. قرار
  المالك 2026-09-03: يُؤجَّل إلى المرحلة 4 (كان مطروحاً كبند مفتوح
  في تدقيق docs/marketing).
- ☐ عزل المستأجرين على مستوى القاعدة (RLS)
- ☐ نسخ احتياطي + **استعادة مُختبرة**
- ☐ **`brand.locale: 'ar'|'mixed'|'en'`** في `packages/shared/src/brand-kit.ts`
  (الافتراضي `'ar'`) — يُقرأ عبر `/api/client` ويستعمل كافتراضي في
  `apps/dashboard/LocaleProvider`. localStorage يبقى override يدوي.
  **مطلوب لإنهاء دَين المرحلة 3.2.**
- ☐ **تفعيل «سجل التصديرات» و«الاستهلاك»** في `/client` بعد توفّر
  PostgreSQL — البطاقات مُهيَّأة ومُخفيّة حالياً.
- ☐ **تفعيل `brand.assets.version`** — الحقل موجود في نوع `BrandKit`
  (`packages/shared/src/brand-kit.ts`) وفي المواصفة (`docs/03 §assets`)
  ولا يقرأه أحد. يُربط بتحميل الخطوط والقوائم عند بناء نظام الإصدارات
  الموصوف في `docs/13-asset-lifecycle.md`. **قرار المالك 2026-09-03**
  بعد اكتشافه في تدقيق `docs/marketing §6-أ` — نصف ميزة، لا نقص توثيق.

## بنود جديدة من مسح الميزات (docs/12)

- ☐ **النماذج القابلة للمشاركة** — رابط يفتح نموذجاً بحقول القالب
      فقط (عنوان · مصدر · صورة)، بلا وصول للهوية أو القوالب. **أرخص
      ميزة وأعلاها أثراً للوكالات** (docs/12 §6). Placid و Imejis
      يملكانها.
- ☐ **واجهة القصّ الذكي** — تفاعل مع نتائج كشف الوجوه من المرحلة 3.8:
      اقتراح مربع القصّ الأولي (مِن الوجه) مع مربع قابل للسحب وشريط
      تكبير (نفس نمط `openCvCrop` الموروث). القصّ بلا تعديل مرفوض
      (docs/12 §5).
- ☐ **واجهة التفريغ** — تحرير النصّ الموقوت من خدمة `services/transcriber/`
      (3.8): تعديل كلمة بكلمة، ضبط توقيت، إضافة/حذف كسور سطور. القاموس
      المخصّص (`brandKit.transcriptionDictionary`) قابل للنموّ من هنا.
- ☐ **تكاملات AI بمفتاح العميل (BYO-key)** — المؤسسة تُدخل مفتاحها
      (Gemini · OpenAI · Claude · ElevenLabs · Google TTS · Azure)
      وتختار ما يُفعّل. الاستخدامات: صياغات العنوان بثلاثة أطوال ·
      تصحيح التفريغ · التشكيل · التعليق الصوتي (3.8). **قاعدة حاكمة:
      كل مخرَج نموذج اقتراح قابل للتحرير، لا نتيجة نهائية.**
- ☐ **استيراد Figma / Canva** — عنصر جذب (docs/12 §11): يجلب عملاء
      ما كانوا ليأتوا، ولا يحرم مشتركينا. رسوم الإعداد لخدمة
      كاملة تبقى لمن يريدها.
- ☐ **الاستضافة الدائمة** — على R2/S3. Creatomate يحذف بعد 30 يوماً؛
      نحن نُبقي المخرجات دائماً (docs/12 §8). التخزين رخيص، التمييز
      شبه مجاني.

## بنود جديدة من مراجعة السير الجاري (2026-09-02)

اكتُشفت من سؤال «كيف يعمل الفريق فعلاً؟» — لا تظهر في مسح المنافسين
لأنّهم لا يملكونها. تفاصيل كاملة في المستندات المرجعية.

- ☐ **دورة حياة الأصول** — راجع `docs/13-asset-lifecycle.md`.
  - سكربت `scripts/check-asset-drift.mjs` (فحص شهري آلي: مقاسات
    المنصات · إصدارات النماذج والخطوط · بصمة `simple-icons`).
  - تذكير آلي في تقويم المالك لمراجعة ربع سنوية بشرية (إرشادات
    العلامات · إعادة استعلام Wikidata · مراجعة عيّنة مخرجات).
  - بنية مجلد `mediakit-assets/YYYY.MM/` + symlink `latest`.
  - **قاعدة الشحن:** لا حذف لإصدار قيد الاستعمال — `scripts/
    prune-old-asset-versions.mjs` يحذف فقط ما لا يشير إليه أيّ
    brandKit. **لا فتح الإنتاج قبل تفعيل القناتين.**

- ☐ **سجل مراجعات بيانات العميل** — راجع `docs/14-revisions.md`.
  - جدول `revisions` بـ`diff` + `snapshot` — لقطة كل 10 تعديلات.
  - triggers على brand_kits · projects · templates · users · assets.
  - **الاستعادة إلزامية** — سجل يُقرأ ولا يُستعاد منه = نصف ميزة.
  - RLS منذ اليوم الأول (سجل مسرِّب أسوأ من غيابه).
  - تكامل مع `brand_snapshot` في renders (`brand_revision_id`).
  - سياسة أرشفة: snapshots > 90 يوماً إلى S3.

- ☐ **سير العمل التحريري** — راجع `docs/15-editorial-workflow.md`.
  - جداول `project_state` + `workflow_transitions` + RLS.
  - إعدادات المستأجر بـ `workflow.states[]` و `workflow.transitions[]`
    القابلة للتخصيص.
  - أدوار موسَّعة: `writer · editor · reviewer · approver` بجانب
    القائم (`owner · admin · viewer`).
  - **الردّ بسبب:** ملاحظة إلزامية على التحوّل العكسي.
  - نظام إشعارات (داخل المنتج → بريد → webhook خارجي لاحقاً).
  - قوالب سير عمل جاهزة (فردي · فريق صغير · وكالة كاملة).

- ☐ **التعليقات على موضع في المخرج** — جزء من `docs/15`. نموذج
  `annotations` مربوط بمرجع منطقي (layer + wordIndex) لا بـpixel.
  دبابيس (pins) في المعاينة. الفلترة والحل اليدوي.

**التوسّع في التقدير:** من 5–6 أسابيع إلى **6–8 أسابيع** بعد إضافة
هذه البنود الأربعة (الأصول + المراجعات + السير + التعليقات). التقدير
يفترض بناءها **بالتوازي مع بنود مسح 12** لا بعدها — الفصل بين مجموعتين
بالمرحلة زمنياً مصطنع.

## واجهة الخط الزمني (منقولة من 3.7 بقرار المالك 2026-09-02)

المحرك (`drawTimelineAt` + `buildTimelinePlan` + `templateToTimeline` +
`buildAudioGraph`) جاهز ومختبَر. الواجهة تُبنى فوقه هنا لأنها جزء
من واجهة المنصة — بناؤها منفصلة يعني بناءها مرتين.

- ☐ **مسارات مكدّسة عمودياً** — media/text/audio مرئية بمقاييس زمنية
      متطابقة، درج ألوان لكل نوع.
- ☐ **مقبض تشغيل (playhead)** — يتحرك مع التشغيل، قابل للسحب للقفز
      إلى t محدد.
- ☐ **تكبير زمني** — بحد أدنى 0.5x (نظرة كاملة) وأقصى 20x (تفاصيل
      per-frame). تكبير حول المؤشر عادةً.
- ☐ **محرّر مفاتيح لكل خاصية** — لوحة جانبية تعرض كيفريمز العنصر
      المحدد؛ سحب المفتاح لتغيير t/قيمة، double-click لإضافة/حذف.
- ☐ **معاينة بجودة أقل أثناء التشغيل** — 540×960 · 15fps للتشغيل الحيّ
      (ليس بديل الرندر النهائي). دقة كاملة (1080×1920 · 30fps) عند
      التوقف والإطار الثابت.
- ☐ **وكلاء (proxies) 540p** — تُنشأ عند رفع الأصل، تُستخدم في المعاينة
      الحية والتعديل. الرندر النهائي يستهلك الأصل الكامل.
- ☐ **تراجع/إعادة** — سجل عمليات على مستوى Timeline model، لا على
      مستوى pixels. `Ctrl+Z`/`Cmd+Z` قياسي.
- ☐ **قوالب جاهزة كنقطة بداية** — لا لوحة فارغة. مكتبة قوالب فيديو
      شبيهة بقوالب البطاقات (المرحلة 2) لكن لـTimeline v2.

**إعادة تعريف «المطابقة البكسلية»:** المعاينة الحية بجودة أقل هي
اختصار محسوب، لا تناقض مع القاعدة 4 (`drawAt` خالصة). المطابقة
البكسلية = **عند التوقف وفي الإطار الثابت المُصدَّر**، لا أثناء
التشغيل الحي في المعاينة.

**البوابة:** عميل جديد يعمل ذاتياً من التسجيل حتى التصدير بلا تدخّلك.

---

# بنود مؤجَّلة — التوقيت يحدده المالك

- ☐ **مراجعة تصميمية شاملة للقوالب الستة** — تقييم كل قرار بصري بمعيار
      الجودة الصحفية لا بمعيار مطابقة الأصل (`reference/aa-media-kit.html`).
      يشمل: القوالب الأربعة الموروثة (breaking · card_centered · card_bottom
      · card_kicker) + الاثنين المُضافين (reel · plain). كل طبقة تُسأل:
      «هل ترتيبها/حجمها/موقعها يخدم القارئ العربي، أم فقط يطابق الأصل؟»
      **مرجع القاعدة 10 في CLAUDE.md.** التوقيت يحدده المالك.

- 🔻 **قياس دقة التفريغ — معلَّق (2026-09-03).** يحتاج مقطعاً إخبارياً
      عربياً 30-60 ثانية بسياق كامل. عيّنة Common Voice القصيرة
      (3-6s أحادية الكلمة) تقيس الحالة الأسوأ لا حالة الاستخدام
      (WER = 50% median مع Whisper small — رقم بلا معنى لمنتجنا).
      المصدر المرجَّح: تسجيل من المالك، أو أرشيف مرخّص عند توفّره.
      **البناء الوظيفي مُنجَز؛ الرقم فقط ينتظر عيّنة صالحة.** راجع
      `docs/LESSONS.md §L-42`.

- 🔻 **نماذج Whisper المضبوطة للعربية — معلَّقة (2026-09-03).** تُفحص
      إن ظهرت دقة ضعيفة في القياس على مقطع إخباري. البدء بالنموذج
      القياسي (`small`، MIT) لتفادي فحص رخص قد لا تبرّره الفروق. عند
      وجود مقطع إخباري + قياس ضعيف: مرشّحات معروفة (arbml/whisper-ar،
      elgeish/whisper-arabic) تحتاج فحص رخص فردي.

> **✓ مسح الميزات المنهجي** — أُنجز 2026-09-02. النتائج الكاملة في
> `docs/12-feature-scan.md`. أحد عشر بنداً مُصنَّفاً للإصدار الأول
> وُزِّعت على المرحلتَين 3.8 (امتدادات المحرك) والمرحلة 4 (المنصة).
> بند «التوليد بالجملة» يبقى في المرحلة 5 مكاناً، **موسوماً «مقدَّم
> للإصدار الأول — أولوية أولى» بقرار المالك**. البنود التالية انتقلت
> من هذه القائمة إلى المرحلة 3.8: **الإسناد**، **الموشن جرافيك
> المتجهي**.

---

# المرحلة 5 — النمو

مرتبة حسب الأثر مقابل الجهد:

- ☐ **التوليد من مصدر بيانات** — رابط خبر أو RSS ← بطاقة تلقائياً
- ☐ **قوالب الأرقام والاقتباس ونتائج المباريات** — أكثر ما يُنشر عربياً بعد العاجل
- ☐ **العنوان في ثلاثة أطوال** — صياغة تلقائية لكل مقاس
- ☐ **توليد بالجملة** — CSV ← عشرون بطاقة. **مُقدَّم للإصدار الأول
      (docs/12 §7) — أولوية أولى في هذه المرحلة.** الحاجة الفعلية:
      الوكالة تنشر عشرين بطاقة صباح كل يوم من جدول أو RSS، وهذا العميل
      الأوّل لا العاشر.
- ☐ **تدقيق ما قبل التصدير** — تباين · منطقة آمنة · عدد كلمات · وجه تحت النص
- ☐ **سجل ومراجعة** — مصمّم يُنتج، مسؤول يعتمد
- ☐ **API عام** بمفاتيح وحصص
- ☐ تكاملات: Buffer / Later / Zapier / Slack
- ☐ Photopea كإضافة اختيارية

---

# مسار العميل الأول (متوازٍ)

- ☐ استمارة الإعداد مُرسَلة وموقّعة
- ☐ ملفات الخط + إقرار الترخيص مستلمة
- ☐ الشعار والألوان مستلمة
- ☐ خمس منشورات مرجعية للمطابقة
- ☐ بناء `brands/client-01.json`
- ☐ **إرسال خمس بطاقات وفيديو بهويته — قبل أن يدفع، بلا شرائح ولا واجهة**
- ☐ العقد + بند حقوق الصور + سياسة الاحتفاظ
- ☐ التسليم والتدريب

**هذه أهم خطوة تجارية في المشروع كله.** تقلب المحادثة من «هل أشتري أداة؟» إلى «هذا أفضل مما ننتجه — كم؟»

---

# ما لا يُبنى

| البند | السبب |
|---|---|
| مفاتيح لونية، تتبّع، جسيمات، 3D، LUT | قيد Canvas 2D حقيقي |
| توليد صور بالذكاء الاصطناعي | سلعة، ليست مشكلتك |
| شبكة نشر وجدولة | Buffer وLater — تكامل لا منافسة |
| منتج تسميات توضيحية | سوق مزدحم بمنافسين ممولين |
| توسّع تلقائي (مستوى 3) | يحتاج نضجاً تشغيلياً لا يبرّره ثلاثة عملاء |
| خادم لكل عميل افتراضياً | ADR-007 — طبقة تسعير لا معمارية |

> **خرج من القائمة:** محرّر الخط الزمني — يُبنى كاملاً من الإصدار الأول (المرحلة 3.7).

---

# سجل القرارات

**تنبيه:** جدولان — النافذة (قرارات لا تزال تحكم الكود) والمنقوضة (أرشيف لا يُحذف — يشرح لماذا لم نفعل X). كل قرار منقوض تسبّبه في تعلّم مسجَّل في `docs/LESSONS.md`.

## نافذة

| التاريخ | القرار | الأثر |
|---|---|---|
| — | ADR-008 يُلغي `concurrency: 1` | كان مبنياً على افتراض ملفات مؤقتة؛ الأنبوب يزيل القيد |
| — | ADR-009 موقع الخادم قرار أداء | المشروع خليجي؛ إقامة العميل في أوروبا لا تُنشئ اختصاصاً |
| — | BiDi ينتقل إلى المرحلة 1 | أي اسم لاتيني في عنوان عربي يُكسر اليوم |
| — | **الخط الزمني الكامل من الإصدار الأول** | قرار المالك. يُلغي القاعدة 9 السابقة. +6–8 أسابيع، مرحلة 3.7، ملف 10. التنفيذ بمحرّك حركة عربي لا نسخة من محرّر أجنبي |
| — | فك ترميز مسبق + قرص 500GB | الخط الزمني يعيد القرص جزئياً إلى المعادلة (ADR-008 يبقى للتجميع النهائي). `edit` بعامل واحد |
| — | المعاينة بجودة أقل أثناء التشغيل | أربعة مسارات بستين إطاراً تتلعثم على أجهزة متوسطة. المطابقة البكسلية عند التوقف |
| 2026-08-28 | BiDi طبقة **قبل** `parseTokens` لا داخله | الحل داخل المفسّر يخلط الطباعة بالنحو ويكسر نقاءه. الطبقة الخارجية تُعيد سلسلة نصية جاهزة؛ كلفتها استدعاء إضافي فقط |
| 2026-08-28 | `CanvasDrawContext` واجهة أدنى لا `CanvasRenderingContext2D` | نفس الكود يعمل في المتصفح و skia-canvas في Node بلا `lib.dom` في `packages/engine`. يبقي المحرك محايداً بيئياً |
| 2026-08-28 | كتالوج خطوط مستضاف ذاتياً (7 خطوط) | لا CDN جوجل: الخادم لا يقرأ CSS، والتطابق البكسلي شرط، وتحديث جوجل الصامت يكسر كسور السطور |
| 2026-08-28 | لا مكتبة موسيقى في الإصدار الأول | Content ID يقرأ البصمات لا الرخص — حتى CC0 قد يُطالَب به ضد العميل. رفع العميل هو المسار |
| 2026-08-28 | الطبقات دوال منفصلة أولاً، لا مفسّر قوالب | كل طبقة `(ctx, size, brand, params) → void` تُختبَر مستقلة قبل بناء مفسّر JSON فوقها. أرخص للاختبار، أوضح للفصل عن الهوية، لا تراكم حالة |
| 2026-08-28 | ألوان التدرّج (`rgba(0,0,0,α)`) ليست هوية بل تعريف «التغميق» | التدرّج قناع تعتيم. `shape/band` هوية؛ الأسود المشفف تعريف الأداة نفسها. مطابق للأصل — لا انحراف عن السلوك، ولا مثبت هوية جديد |
| 2026-08-28 | أصول الحزم (شعار مشترك، خطوط) تُستضاف في مستودع منفصل، تُشار من `assets/fonts/` محلياً | يبقي المستودع الرئيسي خفيفاً، والأصول تُحدَّث باستقلال. `IBM Plex Sans Arabic` (300/400/700 TTF) + OFL محمّلة الآن — أول عرض بصري يعتمد عليها |
| 2026-08-28 | `resolveBrand` مرة واحدة قبل الرندر، لا داخل كل طبقة | البديل: يستدعي كل طبقة `resolve` عند كل رسم. الفيديو ينادي الطبقات آلاف المرات، والخطأ لن يظهر إلا في منتصف إطار 900 من فيديو عميل. التسطيح مسبقاً يجعل مرجعاً مكسوراً يفشل عند التحميل، وطبقات الرسم تستهلك قيماً حرفية فقط |
| 2026-08-28 | مرجع غير قابل للحل يرمي، لا يعيد السلسلة كما هي | Canvas يبتلع اللون غير الصالح صامتاً ويحتفظ بآخر قيمة. ينتج لون عشوائي في مخرج عميل بلا خطأ ظاهر — كارثة تشخيصية. الرمي المبكّر يجعل الخطأ مكشوفاً. → `docs/LESSONS.md#L-04` |
| 2026-08-28 | نمط uniform يستبدل التناوب كافتراضي طباعي | قرار المالك: الصحافة العربية المحترفة تفضّل أسطراً متقاربة الطول لا نمطاً هرمياً متذبذباً. النمط المتناوب موروث من الأداة القديمة ومرفوض تجارياً. `wrapOptimal` بمود `uniform` (الافتراضي). `alternating` يبقى متاحاً لمن يريده. → `docs/LESSONS.md#L-01` |
| 2026-08-28 | `DEFAULT_BRAND.typography.breaking.shortLineRatio = 1.0` | الحقل يبقى في المخطط للتوافق مع mode='alternating' فقط. الافتراضي 1.0 يجعل كل الأسطر بنفس الحدّ في أي مود |
| 2026-08-28 | اختيار fs بقيد صارم قبل الكلفة — لا منافسة كلفات عبر الأحجام | أكبر fs مقبول يفوز. المقروئية تسبق الكمال الحسابي. DP يبقى داخل كل زوج (fs, k) لاختيار أفضل تقسيم — لا لاختيار fs |
| 2026-08-28 | `readableMinRatio` نسبة من عرض القماش، `targetFill=0.9` هدف صريح | `readableMinRatio=0.045` أرضية طوارئ تتكيّف مع مقاسات المخرجات. `targetFill` يُستعمل في المسارات غير `preferLargestFs`. → `docs/LESSONS.md#L-02` |
| 2026-08-28 | قاعدة «التبديل نزولاً»: swapMaxFsDiff=6 و swapMinFillGain=0.15 | تُستعمل حين `preferLargestFs=false`. المسار الحالي (كشيدة) يتخطاها لأنه يعتمد على النطاق المفضّل والاستكشاف الثنائي (fs, boxW) |
| 2026-08-28 | `minLines=2` و `preferredLines=3` في `TypographyBreaking` | `minLines=2` يمنع «سطراً هابطاً» من أعلى البطاقة. `preferredLines=3` هو النمط الصحفي القياسي |
| 2026-08-28 | تخطيط: `anchor='centerLower'` — مركز الكتلة عند 62% من الارتفاع | القديم: تثبيت آخر سطر عند 200px من الأسفل — يعطي فراغاً علوياً كبيراً عند العناوين القصيرة. الجديد يوازن أياً كان عدد الأسطر |
| 2026-08-31 | مسار الكشيدة (أ) — المرحلة **1.5** (قُدِّم من 3.5) | لافتة المنتج التنافسية: التبرير بالكشيدة لا يفعله متصفح منذ IE 5.5. نُنفّذه قبل بقية الطبقات فالمعاينة الأولى تحمل التمايز. المسار (ب) محاور متغيرة و(ج) HarfBuzz يبقيان في 3.5 عند الحاجة لخطوط بعينها |
| 2026-08-31 | `boxWidth` نطاق لا ثابت (`boxWidthRange = [0.72, 0.88]`) | الكشيدة أداة ضبط دقيق. عرض ثابت 900 يخلق فجوة تفوق سعتها فتُعطَّل. `wrapOptimal` يستكشف عدة عروض ويختار (fs, boxWidth, k) الأمثل. `WrapResult.boxWidth` يحمل الاختيار |
| 2026-08-31 | قيم `justify` في `DEFAULT_BRAND` مطابقة docs/03 حرفياً — بلا تخفيف | `maxStretchPerSite=0.35`, `maxSitesPerWord=1`, `minLineFill=0.82`, `mode='kashida'`. إغراء التخفيف لجعل الكشيدة تبدو أقوى بصرياً مرفوض — الحلّ في مكان آخر (نطاقات boxWidth و fs). → `docs/LESSONS.md#L-05` |
| 2026-08-31 | `capabilities.kashida=true` في `DEFAULT_BRAND` (كان false) | IBM Plex Sans Arabic يرسم U+0640 بعرض معقول. الخطوط المرفوعة تمرّ بـ`detectFontCaps` — التراجع الصامت في `justifyLine` يحمي من الخطوط غير الداعمة بلا خطأ |
| 2026-08-31 | `headlineFsRatio = [0.065, 0.085]` نطاق حجم خط مفضّل | نسبتان من عرض القماش (70-92px @1080) — النطاق الصحفي القياسي لبطاقة العاجل. القيد المفقود سابقاً الذي جعل الحلول تنزلق إلى 5-6% من القماش. `readableMinRatio` يصبح أرضية طوارئ. → `docs/LESSONS.md#L-02` |
| 2026-08-31 | wrap يعتمد قبول ما-بعد-الكشيدة (`justifyCapacityConfig`) | القبول القديم يقيس الملء الخام. الجديد يقدّر السعة عبر `estimateLineCapacity` ويقبل إن `(raw+cap)/boxW ≥ 0.82`. مصدر السعة الوحيد في `kashida.ts` — يستعمله wrap و justifyLine بلا ازدواج |
| 2026-08-31 | إعادة تفسير `minLineFill` في `justifyLine` كـ«ملء بعد الكشيدة» لا خام | بدون ذلك: wrap يقبل سطراً بناءً على السعة، ثم justifyLine يبتلعه بحرس الملء الخام. الحرس الجديد: `if (best_possible_post_fill < minLineFill)` — يترجم القيمة إلى غايتها الطبيعية |
| 2026-08-31 | مسافة المصدر: `fs × 0.9` → `fs × 1.4` | القيمة القديمة أنتجت التصاقاً بصرياً بين العنوان والمصدر. المسافة تبقى نسبية إلى `fs` — تتناسب مع حجم الخط |
| 2026-08-31 | **`maxSitesPerWord = 1` مؤكَّد بالتجريب البصري لا بالتقدير** | ثلاثية A/B/C: A (sites=1)، B (sites=2)، C (بلا كشيدة). المالك رأى B وقال «مشوّهة لا مبرَّرة» — أربعة تطويلات في كلمة واحدة تبدو خطأً. قيمة docs/03 صمدت. → `docs/LESSONS.md#L-06` |
| 2026-08-31 | إعداد A هو المعتمد: fs≈74 (6.9%)، boxW≈950 (88%)، 3 أسطر | نتيجة الحسم البصري بعد التجريب. `preview-default.png` + `preview-default-nokashida.png` مقارنة دائمة في `out/`. → `docs/LESSONS.md#L-03` |
| 2026-08-31 | **بوابة المرحلة 1 مُتحقّقة بإثبات آلي** — `brands/client-demo.json` كهوية ثانية | `pnpm preview -- --brand=default` مقابل `--brand=client-demo` أنتج مخرجَين مختلفَين تماماً (خط، ألوان، حجم، بوكس، شارة). `git diff HEAD packages/` = صفر — الفصل ليس ادّعاء بل أثر مُلاحَظ بأداة تتبّع. بنود الربط بالأداة القديمة (`cvCtx`، `getElementById`، الواجهة فوق المحرك) نُقلت إلى المراحل 2/4 — البوابة عن الفصل لا التكامل مع الأداة الموروثة |
| 2026-08-31 | حزمة `@pf-mediakit/templates` مستقلة — types + schema + validator + سجل قوالب | الأنواع في templates لا في shared (قرار المالك). المتحقق **يدوي بلا Ajv** — يُبقي شجرة التبعيات نظيفة (لا حزم runtime في engine/shared/templates). المخطط منشور كبيانات (JSON Schema draft-07) لمن أراد ajv خارجياً. كل قالب مُتحقَّق منه **عند الاستيراد الأول** — لا تحقق في مسار الرندر (حرج للـ60fps) |
| 2026-08-31 | `renderFrame` مفسّر طبقات — engine يعتمد templates لأنواع فقط | engine يستهلك `Template` و `Layer` كأنواع من `@pf-mediakit/templates` عبر `import type`. صفر runtime dep إضافي. الطبقات نفسها تُنفَّذ بنداءات على `layers/*` و `text/*` القائمة (لم يُغيَّر أي منها) |
| 2026-08-31 | مطابقة بكسلية بعد refactor إلى renderFrame — MD5 قبل=بعد | `preview-default.png` قبل الاعتماد على renderFrame كان `a05e5cb8c777e1390779b018656cdd74`؛ بعد الاعتماد الكامل نفس المجموع تماماً. `snapshots/preview-{default,client-demo}.png` كلقطات ذهبية + `pnpm verify:snapshot` كبوابة تلقائية |
| 2026-08-31 | إبقاء بعض أنواع الطبقات (`kicker`, `accent`, `watermark`) بلا رسم في MVP | القالبَان card_kicker و card_bottom يستعملانهما — لكن الرسم مؤجَّل. المتحقق يقبلها (بنية صالحة)، المفسّر يتخطاها بلا رمي (`return` هادئ) كي لا يكسر بقية الطبقات. تنفَّذ الرسم عند طلبها من قالب حي. جدير بالذكر: watermark ليس فقط للتراجع — قد يظهر في `fallback` breaking المستقبلي |
| 2026-08-31 | **بوابة المرحلة 2 مُتحقّقة** — `plain.json` (قالب خامس) بلا كود | `packages/templates/src/templates/plain.json` استُورد في `packages/templates/src/index.ts`، ومرّ بـ`validateTemplate` عند الاستيراد، ورُسم عبر `pnpm preview -- --template=plain`. صفر تعديل في `packages/engine/src/render.ts` بعد تجاوز MVP. الإثبات: أي قالب يستعمل أنواع الطبقات المدعومة يُضاف بملف JSON واحد |
| 2026-08-31 | **إغلاق دَين المرحلة 2** — منفّذات kicker/accent/watermark | `render.ts` امتدّ ليدعم الطبقات الثلاث المؤجَّلة. الآن كل القوالب الستة تُرسم كاملة. accent يعمل بثلاثة أوضاع (underline/above-first-line/span)؛ span يستعمل `accentFrom/accentTo` من `drawLine*` المُرجَعة عبر تراكم في `RenderState.headlineAccentSpans`. watermark يرسم بشفافية فقط — التلوين مؤجَّل عند أول عميل بشعار |
| 2026-08-31 | `normalizeHeadlineFont` — headline/title3l يورّثان knobs التخطيط من `breaking` | البديل: توسيع كل TypographyXxx في shared لحمل headlineFsRatio, boxWidthRange, minLines, … — يُنتج تكراراً في كل brand. الحل: `renderFrame` يقرأ max/min/lineHeight/boxWidth من التكوين المطلوب، ويُوَرَّث الباقي من `brand.typography.breaking`. `TypographyReelTitle` استثناء — قيمه مختلفة (fs أصغر، shortLineRatio للريلز) فوُسِّعت في shared. → `docs/LESSONS.md#L-01` (لا نقل حرفي بلا فحص — التكرار عيب) |
| 2026-08-31 | `HeadlineAnchor.below-kicker` + `KickerLayer.verticalAnchor` | التتابع kicker → accent(underline) → headline(below-kicker) يعمل نظيفاً عبر `RenderState.kicker`. القوالب card_kicker وأمثالها تحقّق تخطيطاً محكماً بلا حساب مواضع في القالب نفسه — كل شيء نسبي |
| 2026-08-31 | 12 لقطة ذهبية (6 قوالب × 2 هويتين) في `snapshots/` | `pnpm verify:snapshot` يعيد تشغيل preview مع `--template=all` لكل هوية، ثم يقارن كل ملف بايت-بايت. جولة أولى: 12 مطابقة · 0 إخفاق. أيّ regression في renderFrame أو أي طبقة سيَظهر فوراً |
| 2026-08-31 | إصلاحان في card_kicker بعد مراجعة اللقطات | (١) accent underline offset 0.12→0.32 من fs — كان يقطع خط النازل في الحروف (ي، ق، ن) بصرياً. (٢) headline في card_kicker يستعمل `brand.typography.title3l` (كما نصّت docs/04) لا `breaking` — كنت غيّرته لأن title3l لم يحمل knobs التخطيط. الحلّ: extend title3l بـ`minLines: 1, preferredLines: 2` (تكوين titles قصيرة)، ودع `normalizeHeadlineFont` يورّث الباقي من breaking. لُقطتا card_kicker جُدّدتا. **درس L-05:** رقم 0.12 كان تعسّفياً — استُبدل بـ0.32 مشتقّ من قيد فيزيائي (عمق النازل في IBM Plex/Almarai ≈ 0.20-0.25 × fs) |
| 2026-08-31 | `drawAt` دالة خالصة من الزمن إلى إطار (ADR-004) — اختبار حاسم للنقاء | `packages/engine/src/timeline/draw-at.ts`. لا حالة وحدة قابلة للتغيير (فحص scripts/check-engine-purity.mjs يمنعها). كل استدعاء يبني `state: RenderState` فارغاً محلياً. الاختبار الحاسم `timeline.test.ts`: 6 أوقات تُرندر مرة متسلسلة `[0, 0.3, 1, 2, 5.7, 7]` ومرة عشوائية `[5.7, 0.3, 7, 0, 2, 1]`، والـops المسجّلة من mock-ctx متطابقة بالضبط لكل t. أي تسرّب حالة كان سيُنتج فرقاً بمجرد تغيير الترتيب |
| 2026-08-31 | `renderVideo` أنبوب مباشر — Canvas → getImageData → Buffer RGBA → FFmpeg stdin | `apps/renderer/src/index.ts`. `ctx.clearRect` قبل كل drawAt (لا حالة سطح متراكمة). `stdin.write` مع انتظار `drain` — يمنع تضخّم ذاكرة Node عند فيديوهات طويلة. فشل ffmpeg (exit != 0) يُرمى إلى المستدعي. مطابق ADR-008: صفر ملفات إطارات على القرص |
| 2026-08-31 | ffmpeg 9.0.1 تبعية نظام إلزامية | Homebrew على الميني (`/opt/homebrew/bin/ffmpeg`)، مع `libx264` + `aac` + `videotoolbox`. VPS الإنتاج يجب أن يحمل نفس النسخة أو أحدث — تُوثَّق ضمن دليل النشر. الأقدم قد يفشل في color primaries bt709 أو بعض flags حديثة |
| 2026-08-31 | تحريك per-line للـheadline عبر تقسيم `runHeadline` | `prepareHeadline` تُصدَّر الآن من `render.ts` — تحسب wrap+justify+bounds بلا رسم. `drawHeadlineLine` تُصدَّر — ترسم سطراً واحداً بحسب `PreparedHeadline`. drawAt يستدعي prep مرة، ثم يرسم كل سطر بـsave/globalAlpha/translate خاصة به بحسب stagger. هذا الفصل يسمح للـ per-line stagger بلا تكرار منطق اللف |
| 2026-08-31 | **`RenderPlan` — يفصل الحساب (مرة) عن الرسم (لكل إطار)** | تشخيص `scripts/diagnose-render-perf.mjs` على 100 إطار كشف أن `wrapOptimal` يستهلك 99.5% من زمن الإطار (730ms/إطار) لأنّه يُعاد حسابه لكل إطار رغم أن المدخلات لا تتغيّر عبر الزمن. `packages/engine/src/render-plan.ts` جديدة: `buildRenderPlan({ctx, size, template, brand, content, fps?}) → RenderPlan {timeline, headline?, headlineLineCount, animations}`. `drawAt` يقبل `plan` — يتخطّى wrap+justify+parseAnimations+timelineOf ويستهلك الجاهز. **النقاء محفوظ:** الخطة قيمة مُشتقّة تُمرَّر كوسيط، لا حالة عابرة (اختبار النقاء الزمني بقي أخضر). **قابلية Canvas-independent:** `PreparedHeadline.measure` صار اختيارياً؛ `drawHeadlineLine` يُنشئ measurer طازج من ctx الرسم إن غاب — لأن الخط مُسجَّل عالمياً في skia-canvas. **النتائج:** 722.7ms/إطار → 1.5ms/إطار (×471). MP4 حقيقي 177s → 2.2s. MD5 المخرَج نفسه بالضبط (`d4bbbd9540acc495f92f0def80f05eee`). للتوافق: إن لم يُمرَّر plan، drawAt يبنيه داخلياً (preview.mjs لم يتغيّر). → `docs/LESSONS.md#L-07` |
| 2026-08-31 | BullMQ + Redis 8.10.1 على قاعدة معزولة (session 2) | `apps/renderer/src/{validate,queues,worker}.ts`. Redis 8.10.1 كان مثبَّتاً مسبقاً على الميني، مشترك مع مشاريع أخرى (منهاج). العزل عبر: `REDIS_URL=redis://127.0.0.1:6379/3` (قاعدة منفصلة، الافتراضية 0) + `BULLMQ_PREFIX='pf-mediakit'` (يسبق كل مفاتيح Redis). كلاهما من متغيرات البيئة في `.env.example`. أربعة طوابير كما نصّت docs/08: urgent=2 عمال/30s، normal=`floor(cores/2)`/3m، edit=1/10m، batch=1/بلا. المهلة per-queue بـ`Promise.race` (BullMQ لا يوفّرها built-in) |
| 2026-08-31 | حصة عادلة على tenantId بآليتين متكاملتين | (١) **الأولوية عند الإدخال:** `priority = 1 + (tenantWaiting × 10)`. BullMQ يسحب الأدنى أولاً، فمستأجر بلا طابور يسبق مستأجراً محتقناً — round-robin طبيعي بلا مخطّط مخصص. (٢) **cap مطلق per tenant عند التنفيذ:** `ceil((urgent+normal)/2)`. INCR/DECR في Redis حول `renderVideo`، DECR في `finally` مهما كانت النتيجة. الآليتان معاً: الأولوية تُرتّب، الـcap يمنع الاحتقان. اختبار الذروة أثبت النمط: 9 مهام من 3 مستأجرين خرجت بترتيب `A→B→C→A→B→C→A→B→C` تماماً |
| 2026-08-31 | التحقق قبل الطابور نقطة رفض وحيدة | `validate.ts` يفحص: template معروف، tenantId string غير فارغ، size ∈ [320, 4096]، content object، brand مُحلَّل، مدة متوقعة ≤ 90s. **لا لمس لـRedis عند الفشل** — 8/8 مهام معطوبة رُفضت باختبار العزل، صفر تسرّب إلى `waiting`. القرار: المشكلة تُقتل عند نقطة الدخول لا عند التنفيذ (`fail-fast` على حدود النظام — L-04) |
| 2026-08-31 | **بوابتا المرحلة 3 مُتحقّقتان — Phase 3 ☑** | ذروة: 9 مهام urgent متزامنة، max wait 15.13s ≤ 45s target (هامش 66%). عزل: 8/8 مهام معطوبة مرفوضة، مهمة صحيحة معالَجة في 1.60s بعدها. سكربتان في `scripts/test-{peak-load,isolation}.mjs` قابلتان للتشغيل مرة أخرى في أي وقت. لا نحتاج CI جهدة بعد — الاختباران يوثّقان السلوك المطلوب |

## منقوضة (أرشيف — لا تُحذف)

| التاريخ | القرار المنقوض | سبب النقض · الدرس |
|---|---|---|
| — | الكشيدة تصعد إلى مرحلة مستقلة (نصّاً غامضاً) | استُبدل بقرار محدَّد 2026-08-31: مسار (أ) إلى المرحلة 1.5 |
| 2026-08-28 | ~~`wrapAlternating` نقل حرفي، لا خوارزمية أذكى في الإصدار الأول~~ | الأصل ليس مرجعاً للجودة، هو مصدر قيم فقط. المعيار: الطباعة العربية الصحيحة كما في الصحافة المحترفة. → `L-01` |
| 2026-08-28 | ~~`wrapOptimal` يحلّ محل `wrapAlternating` كافتراضي — DP لأقل كلفة إجمالية مع نمط هرمي~~ | النمط الهرمي (`shortLineRatio<1`) موروث من الأصل والقرار التجاري رفضه. → `L-01` |
| 2026-08-28 | ~~`brand.typography.breaking.wrapMode: 'optimal' \| 'alternating'`~~ | أعيد كوضعَي `'uniform' \| 'alternating'` — uniform افتراضي بلا تناوب |
| 2026-08-28 | ~~معيار قبول طباعي (uniform): stddev ≤ 12%، minFill ≥ 85%، lastRatio ≥ 60%، لا كلمة واحدة~~ | الخوارزمية كانت تُذبذب `fs` بين 44 و 80 بحسب توزيع الكلمات — عنوان بخط 44 غير مقروء. المعيار صحيح، آلية اختيار fs (منافسة كلفات) هي الخلل. → `L-05` |
| 2026-08-28 | ~~`readableMin=56` حدّ مقروئية صلب في `TypographyBreaking`~~ | 56 رقم متعسّف — أنتج نتيجة أسوأ. النصّ التجريبي أعطى 3 أسطر بملء 59–79% عند fs=56، بينما fs=54 يعطي سطرين بملء 99% والفرق 2px لا يُرى. → `L-02` |
| 2026-08-31 | ~~ثلاثية A/B/C للمعاينة الدائمة~~ | كانت أداة تجريب لا معاينة نهائية. حُسمت لصالح A، فتحوّلت المعاينة إلى preview.png/preview-nokashida.png. الثلاثية موثَّقة تاريخياً هنا لا في `out/` |

---

# دَين تقني — تحت المراقبة

| # | البند | الأثر | متى يُحسم |
|---|---|---|---|
| D-01 | `splitBidiRuns` تصنيف مبسّط لا كامل — لا يعالج AL/EN/ES/CS/ON بالتفصيل ولا mirroring للأقواس | سيناريو نادر: علامة ترقيم في حدود المقاطع قد تلتصق بالجهة الخطأ | عند ورود أول شكوى بصرية من العميل الأول أو عند دمج نموذج التشكيل |
| D-02 | `orderRuns` يعكس الكلمات، لا يبني شجرة embedding levels كاملة | كلمة LTR واحدة تظل بلا عكس (صحيح). سلسلتان LTR متجاورتان لا تحدثان في الأخبار العربية عملياً | مع الكشيدة (المرحلة 3.5) — نراجع كامل مسار النص معاً |
| D-03 | `preprocessBidi` غير مربوط بمسار الأداة الحالية بعد | لا أثر — الأداة القديمة تعمل بمسارها؛ الربط في خطوة «الربط» ضمن نفس المرحلة 1 | ضمن بوابة المرحلة 1 |
| D-04 | `mock-ctx.measureText` يُعيد `text.length * 5` (كافٍ لتلبية العقد فقط) | لا اختبار يعتمد عليه — القياس يأتي من `createSyntheticMeasurer`. حماية من الاستخدام الخاطئ مستقبلاً | إن ظهر اختبار يعتمد `ctx.measureText` مباشرة نستبدله بمقياس صناعي مطابق |
| D-05 | ~~`mock-ctx` لا يغطي `save/restore/translate/rotate/globalAlpha/fillRect`~~ | ~~مطلوب مع الطبقات~~ | **مُحسَم 2026-08-28:** `mock-ctx` وسّع ليغطي fillRect و drawImage و createLinearGradient (تدرّج مسجَّل يحمل نقاط التوقّف) و save/restore و globalAlpha و beginPath/fill/moveTo/closePath/arcTo/roundRect و imageSmoothing. `translate/rotate` غير مطلوبين بعد (لا طبقة تستعملهما) — يُضافان عند الحاجة |
| D-06 | ~~`TEST_BRAND` مكرَّر جزئياً مع `DEFAULT_BRAND`~~ | ~~ازدواجية بسيطة الآن~~ | **مُحسَم 2026-08-28:** `DEFAULT_BRAND` مُصدَّر من `packages/shared`، `TEST_BRAND` محذوف، الاختبارات تستورده مباشرة |
| D-07 | ~~`wrapAlternating` جشعة تسمح بسطر كلمة واحدة~~ | ~~نمط بصري متذبذب~~ | **مُحسَم 2026-08-28:** `wrapOptimal` (`packages/engine/src/text/wrap-optimal.ts`) بديل افتراضي — برمجة ديناميكية بأقل كلفة، معاقبات صريحة لسطر الكلمة الواحدة (800)، اليتيم الأخير (1600)، وخرق النمط الهرمي (400). معيار قبول: أكبر fs يعطي حلاً بلا سطر واحد ولا يتيم وملء ≥ 70%. النتيجة على النصّ التجريبي: 5 أسطر متذبذبة → 3 أسطر بمتوسّط ملء 98% وأدنى 94%. `wrapAlternating` مُعلَّم `@deprecated` للتوافق فقط. `brand.typography.breaking.wrapMode` يختار الأسلوب |

---

# دَين توثيق — من الدروس (2026-09-03)

بنود من تصنيف الدروس في `PHASES-docs.md §9`. كلها من الصنف B (تستحق
سطراً في وثيقة عملية، لا قاعدة في CLAUDE.md).

| # | البند | الوجهة | التبعية |
|---|---|---|---|
| DD-01 | إضافة قاعدة L-18 «القسمة على المتوازي لا الضرب» إلى `docs/08 §الطوابير` | `docs/08` | يُنجَز عند أي تعديل تالٍ على docs/08 |
| DD-02 | إضافة قاعدة L-19 «BullMQ 5 يفصل prioritized عن waiting» إلى `docs/08` أو تعليق في `apps/renderer/src/queues.ts` | `docs/08` أو comment | نفس أعلاه |
| DD-03 | إضافة قاعدة L-20 «Next.js + workspace ESM يحتاجان webpack alias» إلى `docs/11 §الإعداد` أو دليل «app setup» عند بدء المرحلة 4 | `docs/11` | مع بدء `apps/studio` في المرحلة 4 |
| DD-04 | إضافة قاعدة L-21 «الصيانة تعني إيقاف الطوابير، لا مجرّد علم» إلى `docs/08 §الصيانة` | `docs/08` | يُنجَز عند أي تعديل تالٍ على docs/08 |
| DD-05 | إضافة قاعدة L-23 «المركّبات الرقمية تحت RTL تحتاج dir="ltr"» إلى وثيقة مكوّنات الواجهة (تُنشأ في المرحلة 4) أو تعليق ملزم في `apps/dashboard` | وثيقة مكوّنات | مع بناء واجهة Studio |
| DD-06 | إضافة قائمة تحقّق «مراجعة أثر رجعي عند نقض قرار» (L-15) إلى قالب المراحل في `PHASES.md §نظرة عامة` | `PHASES.md` (سطر توجيهي) | يُنجَز في أول تحديث لسطر «قاعدة البوابات» |

---

# ما تسلَّم من `docs/marketing` — 2026-09-03

> امتصاص فرع التوثيق (`PHASES-docs.md`) بعد الدمج. القسم أ نُفِّذ منه
> الميكانيكي فقط (DD-06 · G5 checklist)؛ الباقي بنود دَين يستدعيها
> صاحب المشروع أو تُنفَّذ عند بدء المرحلة 4 حسب توجّهها.

## أ. قابل للتنفيذ في main (بلا قرار)

| # | البند | الحالة | ملاحظة |
|---|---|---|---|
| A1 | G1 نظافة الأصول الأناضولية — `scripts/verify-clean-of-aa.mjs` | ☐ | **يتقاطع مع `scripts/check-no-brand-leak.mjs` المُنشأ اليوم** — G1 يفحص رموز كود (`AA_LOGO`, `CV_LOGO`, `HelveticaNeueLTArabic`, `HNArabic`, `AA-60-SANIYE`, `aa_customLogo`)، بينما check-no-brand-leak يفحص نصوص عيّنة عربية. **مكمِّلان لا بديلان** — يمكن دمجهما لاحقاً أو إبقاؤهما منفصلين |
| A2 | G2 عزل الهوية والقالب — `scripts/verify-brand-template-isolation.mjs` | ☐ | 2-3 س دَين — يوحّد 13.2 + 13.3 |
| A3 | G3 ميزانية أداء `buildRenderPlan` + `perf-baseline.json` | ☐ | 1-2 س دَين — العتبة تُشتق من baseline (×1.3) |
| A4 | G5 قائمة يدوية للتوافق الجهازي | ☑ | نُفِّذت — أُضيفت إلى `docs/09-launch-spec.md §القبول قبل التسليم` |
| A5 | DD-01..DD-06 دَين توثيق | جزئي | DD-06 ☑ (أُضيف إلى §نظرة عامة). DD-01/02/04 تنتظر أول تعديل تالٍ على docs/08. DD-03/05 تنتظر بدء apps/studio في المرحلة 4 |
| A6 | بند «تحويل البوابات» في المرحلة 4 | ☐ | يُضاف مع أول تحديث على §المرحلة 4 |
| A7 | قاعدة تنسيق البوابات | ☑ | مضمَّنة في DD-06 (نفس السطر) |
| A8 | مزامنة DD-06 كسطر في «قاعدة البوابات» | ☑ | مع DD-06 |

## ب. يحتاج قرار المالك قبل التنفيذ

| # | البند | القرار المطلوب |
|---|---|---|
| B1 | L-46 المزدوج في LESSONS.md — نسختان بنفس الرقم | (1) إبقاء main · (2) دمج · (3) main + ترقية مسودتي إلى L-47. توصية docs: الدمج |
| B2 | G4 مقارنة بـcommit `e2d730a` (four-gate kashida verification) | تحقّق ما إذا كان G4 مُنجَزاً كلياً أو جزئياً |
| B3 | ADR-010 اعتماد النصّ — النموذج الزمني يُبنى من جديد | إدراج في `docs/02-architecture.md §ADR` |
| B4 | ADR-011 (LRI/PDI) و ADR-012 (AudioPlan) — ترقية تعليقات كوديّة | كتابة نصّ ADR |
| B5 | عدد قواعد PROJECT_INSTRUCTIONS.md — 9 مقابل 10 في CLAUDE.md | إضافة القاعدة 10 أو الإحالة إلى CLAUDE.md |
| B6 | «6 دروس» في CLAUDE.md — الفعلي ~47 | حذف الرقم أو تحديثه (CLAUDE.md §دروس) |
| B7 | عدد القوالب — «أربعة» (09) مقابل «ستة» (06/07/الفعلي) | قرار تسويقي |
| B8 | SLA عاجل — 45s (06/CLAUDE) · 60s (08) · دقيقتان (08) | حسم رقم واحد |
| B9 | 10.3 كشف الوجوه — لا مُشغِّل | تحديد ما يُشغّل بدء العمل |
| B10 | 10.11-10.13 restart/kill/webhook — أبواب مغلقة | فك القفل + اختيار cron أو BullMQ repeat |

## ج. تراكم للجولات القادمة

| # | المحور | العدد |
|---|---|---|
| C1 | الفجوات المعمارية (كود بلا سطر توثيق) | 22 |
| C2 | مواصفة ↔ كود (brandKit + templates + جدول docs/04 قديم) | 30+ |
| C3 | دروس بلا تطبيق كامل (L-18..L-23, L-15) | 6 |
| C4 | بنود مؤجَّلة بشرط ضبابي | 10 |
| C5 | أرقام بلا مصدر قياس | 11 |
| C6 | نقل الدروس التاريخية (L-11, L-24, L-25, L-30) إلى LESSONS-archive.md | 4 |
| C7 | تصنيف L-46 على 12 بوابة محروسة قديمة | 12 |

**قاعدة L-40:** كل جولة تحرير على هذه الجداول تُفتح على فرع
`docs/<موضوع>` مستقل، لا داخل مسار الكود.
