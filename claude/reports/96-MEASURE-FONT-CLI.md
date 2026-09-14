# 96-MEASURE-FONT-CLI — تقرير (بانتظار الإذن قبل الالتزام)

**سطر الاستلام:** استلمتُ 96-MEASURE-FONT-CLI · شجرة `/Users/mdervis/MediaKit/pf-mediakit` على `main`.

**وسم:** 👁‍🗨 رأيتُه في مخرَج · 📄 قاله سكربت ولم أتحقّق · ❓ لا أعرف.

**لا commit، لا push.** الشجرة قذرة بانتظار موافقتك.

---

## §١ · التأكيد قبل الإصلاح (👁‍🗨)

- **`packages/engine/src/render.ts:654`** — الرسالة الحقيقيّة الآن:
  ```
  الإصلاح: أضف metrics عبر `pnpm measure-font <path.ttf>` وضعها تحت كل وزن.
  ```
- **`package.json` الجذر قبل الإصلاح:** `measure-font` = **NOT DEFINED** (👁‍🗨 من `node -e ...`).
- **السكربت الحقيقيّ موجود:** `scripts/measure-font-metrics.mjs` — يستخدم `opentype.js` في السطر 34 (لا تُحذف).

---

## §٢ · الإصلاح

**`package.json` (الجذر)** — أُضيف سطر واحد:
```json
"measure-font": "node scripts/measure-font-metrics.mjs",
```

بين `demo:live` و `check:no-brand-url-fetch`. **`render.ts:654` لم يُلمس** (الرسالة صارت صحيحة بعد الإصلاح). `opentype.js` باقٍ في devDeps الجذر.

---

## §٣ · اختبار الحياة (L-46) — الأحمر ثمّ الأخضر بنسخ حرفيّ

### ٣·١ · الأحمر — هويّة بلا metrics

**الخطوات:**
1. `cp brands/client-demo.json brands/client-demo.json.bak`
2. حذف `metrics` من `light`/`regular`/`bold` (Almarai) — client-demo هويّة `lineHeightMode='dynamic'` ⇒ سترمي
3. `node --import tsx scripts/preview.mjs --brand=client-demo --template=breaking`

**exit=1 · رسالة الفشل الحرفيّة (👁‍🗨 من stderr):**
```
Error: [measuredLineHeight] هويّة «client-demo» — عائلة «Almarai»: لا FontMetrics على أيّ وزن (light/regular/bold). الإصلاح: أضف metrics عبر `pnpm measure-font <path.ttf>` وضعها تحت كل وزن. أو تأكّد أن fillIn من DEFAULT_BRAND يعمل على مسار تحميل الهويّة (toFull() في apps/api/src/shared/brand-kit-mapper.ts، أو fillIn جديد قبل استهلاك brand_snapshot في apps/renderer).
    at computeHeadlineLayout (/Users/mdervis/MediaKit/pf-mediakit/packages/engine/src/render.ts:658:13)
    at prepareHeadline (/Users/mdervis/MediaKit/pf-mediakit/packages/engine/src/render.ts:690:18)
```

استُعيد `client-demo.json.bak` بعد الالتقاط · `bold.metrics = {"ascent":905,"descent":211,"unitsPerEm":1000}` عادت.

### ٣·٢ · الأخضر — نسخ حرفيّ من الرسالة

**الأمر كما يقرؤه المشغّل من الرسالة:** `pnpm measure-font <path.ttf>` — استبدل `<path.ttf>` بمسار حقيقيّ.

**نسختُه حرفيّاً وشغّلتُه على خطَّين حقيقيَّين (👁‍🗨):**

```
$ pnpm measure-font assets/fonts/IBMPlexSansArabic-Bold.ttf
> node scripts/measure-font-metrics.mjs "assets/fonts/IBMPlexSansArabic-Bold.ttf"

▶ measure-font-metrics
  assets/fonts/IBMPlexSansArabic-Bold.ttf
    family: IBMPlexSansArabic-Bold.ttf
    source: OS/2 typo
    ascent:     1085
    descent:    415
    unitsPerEm: 1000
    JSON:  "metrics": { "ascent": 1085, "descent": 415, "unitsPerEm": 1000 }

$ pnpm measure-font assets/fonts/Almarai-Bold.ttf
▶ measure-font-metrics
  assets/fonts/Almarai-Bold.ttf
    source: OS/2 typo
    ascent:     905
    descent:    211
    unitsPerEm: 1000
    JSON:  "metrics": { "ascent": 905, "descent": 211, "unitsPerEm": 1000 }
```

exit=0 · **الحلقة مغلقة**: الوكالة التي تصطدم بالفشل تنسخ الأمر فيعمل، لا يعود «command not found».

---

## §٤ · السؤال الأوسع (جدول لا تنفيذ)

**بحث في كل السلاسل النصّيّة داخل `throw new Error(...)` و `console.error(...)`** عن أنماط `pnpm X` · `npm run X` · `node scripts/Y`. النتائج:

| ملف | سطر | نصّ الأمر في الرسالة | موجود؟ | ملاحظة |
|---|---:|---|:---:|---|
| **`packages/engine/src/render.ts`** | **654** | **`pnpm measure-font <path.ttf>`** | **✓ الآن** | **مُصلَح في هذه التذكرة** (مسبقاً: `NOT_DEFINED`) |
| `scripts/check-docs-bundle-fresh.mjs` | 46 | `pnpm docs:bundle` | ✓ | `= node scripts/bundle-docs.mjs` |
| `scripts/check-docs-bundle-fresh.mjs` | 91 | `pnpm docs:bundle` | ✓ | نفسه |
| `scripts/check-skill-fresh.mjs` | 60 | `pnpm skill:build` | ✓ | `= node scripts/build-skill.mjs` |
| `scripts/check-skill-fresh.mjs` | 107 | `pnpm skill:build` | ✓ | نفسه |
| `packages/db/scripts/check-template-sync.mjs` | 111 | `pnpm db:migrate` | ✓ | جذر: `= pnpm --filter @pf-mediakit/db migrate:up` |
| `scripts/verify-plan-values.mjs` | 142 | `node scripts/generate-plan-golden.mjs` | ✓ | الملفّ موجود (`ls scripts/generate-plan-golden.mjs`) |
| `scripts/demo-live.mjs` | 67 | `pnpm demo:live -- <path/to/live.json>` | ✓ | أُضيف في 90-DEMO-LIVE |
| `scripts/measure-font-metrics.mjs` | 38 | `node scripts/measure-font-metrics.mjs <path.ttf>` | ✓ | الملفّ ذاته يذكر نفسه |
| `apps/api/src/limits/alerts-worker.ts` | 12 | `pnpm alerts:worker` | ⚠ **سياقيّ** | الرسالة توضّح: «script في `apps/api/package.json`». الأمر يعمل من داخل `apps/api/` — من الجذر يحتاج `pnpm --filter @pf-mediakit/api alerts:worker`. **الرسالة نفسها تُوضّح النطاق** — ليست خطأ لكنّها تعتمد على قراءة المشغّل التنبيه. |

### ٤·ب · الحكم على «صنف أم حادثة»

**السبعة الأخرى تعمل — الحادثة كانت الوحيدة على `render.ts:654`.** لكنّ الفحص كشف **نمطاً بنيويّاً هشّاً:**

- **10 مواضع تستدعي أوامر في رسائل خطأ.** كلّها اليوم صحيحة، لكنّ إحداها انزلقت (كانت `pnpm measure-font` تشير إلى معرَّف غير موجود لأربعة أيام منذ BASELINE-A). لا شيء منع الانزلاق.
- **حالة `alerts:worker` سياقيّة** — تعتمد على قراءة المشغّل «script في apps/api/package.json». التنبيه واضح لكنّ الفاحص الآليّ سيرى «`pnpm alerts:worker` من الجذر ⇒ NOT_DEFINED» ويطلق إشارة كاذبة إن لم يفهم النطاق.

**الحكم:** الحادثة الحاليّة كانت واحدة، لكنّ **الصنف موجود ومرشَّح للتكرار** — أيّ إضافة سكربت جديد + إشارة إليه في رسالة خطأ + نسيان تحديث `package.json` = نفس عطب اليوم. الفاحص يستحقّ.

---

## §٥ · وصف `check:error-hints` (ولا تبنِه · حتى قرارك)

### التصميم المقترَح

**النطاق:** يفحص كل سلسلة نصّيّة داخل `throw new Error(...)` أو `console.error(...)` أو `console.warn(...)` في:
- `packages/*/src/**/*.ts`
- `apps/*/src/**/*.ts`
- `scripts/**/*.mjs`

**الأنماط المُلتقَطة (regex بسيط داخل سلسلة النصّ):**
- `` `pnpm ([a-z0-9:_-]+)` `` أو `` "pnpm ([a-z0-9:_-]+)" ``
- `` `npm run ([a-z0-9:_-]+)` ``
- `` `node scripts/([a-z0-9_-]+\.mjs)` ``

**الفحص لكل نتيجة:**
1. **`pnpm/npm run <cmd>`:** يبحث في `package.json` الجذر عن مفتاح `scripts.<cmd>`.
2. **`node scripts/<file>`:** يفحص وجود `scripts/<file>` على القرص.
3. **إن غاب الاثنان معاً:** فشل السكربت مع طباعة `<file>:<line>` + الأمر المفقود + المصدر الذي نطق به.

### النقاط الحسّاسة (يقرّرها المالك قبل البناء)

1. **الأوامر السياقيّة (alerts:worker):** الرسالة توضّح النطاق نصّاً. الفاحص لن يفهم — يحتاج قاعدة:
   - (أ) استثناء صريح في تعليق `// @check:error-hints-allow pnpm alerts:worker (apps/api)` بجانب السطر
   - (ب) البحث الأشمل: يفحص `apps/*/package.json` أيضاً · لكنّه قد يخفي عن المشغّل النطاق
   - **توصيتي: (أ)** — نمط CHECK-FIX/L-71: الاستثناء موثَّق سطرَ-سطرٍ.

2. **السلاسل متعدّدة الأسطر (template literals):** التقاطها بregex عاديّ صعب. حلّ بسيط: استعمال AST parser (`typescript` أو `@babel/parser`). كلفة إضافيّة: تبعية جديدة.
   - **بديل:** بحث `\``pnpm ...` أو `pnpm ...`` — يفوّت بعض الحالات لكن سريع. غالب رسائل الأخطاء بسطر واحد.
   - **توصيتي:** ابدأ بالبحث السطريّ (regex) — يمسك السبعة أعلاه · إن ظهر false negative، رقّي إلى AST لاحقاً.

3. **النطاق:** يفحص فقط داخل `throw` و `console.error`/`console.warn` — لا يفحص التعليقات و docstrings (فيها استعمال شرعيّ لأمثلة).

### كلفة البناء

**~1.5 ساعة:**
- 20 دقيقة كتابة `scripts/check-error-hints.mjs` (نمط `check-no-brand-url-fetch.mjs`)
- 15 دقيقة إضافة إلى `pnpm test`
- 30 دقيقة اختبار سلبيّ (L-46) — أضف رسالة خطأ ترمي إلى أمر خياليّ، تأكّد يفشل، عيّنه، تأكّد يمرّ
- 25 دقيقة توثيق + استثناء `alerts:worker` بتعليق سطر

**~ 30 دقيقة إضافيّة** لو أردت AST بدل regex.

**قرارك:** أبنيه في تذكرة `98-CHECK-ERROR-HINTS`؟ لا أبدأ قبل إذنك.

---

## §٦ · حالة الشجرة

**👁‍🗨** `git status --short` (بلا claude/ و out/):

```
 M package.json                  (+ "measure-font": "node scripts/measure-font-metrics.mjs" · سطر واحد)
```

**👁‍🗨** `git diff --stat`:

```
 package.json | 1 +
 1 file changed, 1 insertion(+)
```

**لم يُلمس:**
- `packages/engine/src/render.ts` — الرسالة على السطر 654 كما هي (صارت صحيحة بعد الإصلاح · لا حاجة لصياغة أوضح)
- `scripts/measure-font-metrics.mjs` — كما هو
- `opentype.js` في devDeps الجذر — كما هو
- `apps/` · `packages/*` عدا فحص السطر 654 — كما هي
- `claude/` (عدا التقرير)

---

## §٧ · لا لبس

- **👁‍🗨 «رسالة الأحمر الحرفيّة»:** رأيتُها من stderr الحاوية.
- **👁‍🗨 «الأخضر بنسخ حرفيّ»:** `pnpm measure-font assets/fonts/IBMPlexSansArabic-Bold.ttf` بلا زيادة · بلا نقصان.
- **📄 «10 مواضع بجدول الأوامر»:** رأيتُ 9 عبر grep + 1 بحث دقيق. `alerts:worker` مذكور في تعليق (`ts:12`) لا في `throw`/`console.error` — أدرجتُه للإحاطة لأنّ سؤالك «كل رسالة خطأ» شمول قد يشمله. **إن أردتَ حصر النطاق في `throw`/`console.error` فقط، `alerts:worker` يُطرَح.**
- **❓ «هل يمكن أن أكون فوّتُّ رسائل أخرى؟»:** غالباً لا — البحث عن `pnpm ` و `npm run ` و `node scripts/` داخل قوس السلاسل شامل. **قد أفوّت** رسائل بلغة عربيّة لا تستعمل الفاصل الإنجليزيّ (مثل «الحلّ:» + الأمر). فحصتُ بعضاً وأكّدتُ نفس النتيجة.
- **📄 «أوامر داخل apps/api/package.json»:** لم أفتح كل ملفّ `apps/api/**/*.ts` لأنّه ليس شجرتي. `alerts-worker.ts:12` ظهر في نتيجة grep — أدرجتُه بدل السكوت.

---

## §٨ · بانتظار قرارك

1. **الإذن بالالتزام والدفع** (سطر واحد في package.json)
2. **`98-CHECK-ERROR-HINTS`:** أفتحها؟ (~1.5 ساعة · النمط جاهز)
