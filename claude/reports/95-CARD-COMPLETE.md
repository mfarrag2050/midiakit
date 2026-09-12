# 95-CARD-COMPLETE — تقرير التنفيذ (بانتظار الإذن قبل الالتزام)

**سطر الاستلام:** استلمتُ 95-CARD-COMPLETE · شجرة `/Users/mdervis/MediaKit/pf-mediakit` على `main`.

**وسم:** 👁‍🗨 رأيتُه في مخرَج · 📄 قاله سكربت ولم أتحقّق · ❓ لا أعرف.

**لا commit، لا push.** الشجرة قذرة بانتظار موافقتك.

---

## §٠ · التقدير قبل التنفيذ

### أ · عدد المواضع التي تتغيّر لكلّ بند من الثلاثة

**تأكيد ما قاله mkau من الملفّ (👁‍🗨):**

- `packages/engine/src/render.ts:244-246` — `runLogo` يمرّر `{}` فارغاً:
  ```ts
  function runLogo(_layer: LogoLayer, args: RenderFrameArgs): void {
    drawLogo(args.ctx, args.size, args.brand, {});   // ← فعلاً {}
  }
  ```
- `packages/engine/src/layers/logo.ts:68` — درو logo يخرج صامتاً إن `params.image` غاب.
- `packages/engine/src/render.ts:955-956` — `runSource` يخرج صامتاً إن `content.source` فارغ أو غائب: `if (typeof text !== 'string' || text.length === 0) return;`
- `packages/templates/src/templates/breaking.json:layer[5]` = `{"type":"logo"}` بلا خصائص. لا يحتاج شيئاً — `LogoLayer` type يقبل `type` + `from?` فقط. الفجوة **في runLogo لا في القالب**.
- `packages/templates/src/templates/breaking.json:layer[4]` (source) بلا تغيير — `runSource` يعامل الغياب صامتاً أصلاً.

**المواضع الفعليّة للتغيير:**

| بند | ملفّ | موقع | عدد أسطر |
|---|---|---|---:|
| ١ · الشعار | `packages/engine/src/render.ts` | `runLogo` سطر 244-246 | **~3 أسطر** |
| ٢ · الصورة | `scripts/demo-live.mjs` | إضافة قراءة `images[]` + تمرير `assets.images.image` | **~15 سطر** |
| ٢ · الصورة | `fixtures/demo-live/example.live.json` | إضافة `images: [...]` | **~4 أسطر** |
| ٢ · الصورة | `fixtures/demo-live/*.png` جديد | 3 صور fixture | **3 ملفّات جديدة** |
| ٣ · المصدر | `scripts/demo-live.mjs` | إزالة `source: 'المصدر'` + إضافة قراءة `sources[]` | **~10 أسطر** |
| ٣ · المصدر | `fixtures/demo-live/example.live.json` | إضافة `sources: [...]` | **~4 أسطر** |

**قوالب أخرى مُتأثِّرة برمجيّاً:** إصلاح `runLogo` يغيّر سلوك **كلّ استدعاء لـ`renderFrame` مع `assets.images.logo`**. **لا استدعاء قائم اليوم يمرّر `assets.images.logo`** — راجع §ج.

### ب · التقدير بالساعات

| المهمّة | تقدير | مصدر التقدير |
|---|---:|---|
| ١ · إصلاح `runLogo` (سطران في render.ts) | 0.25h | نمط IMAGE-FIX (سطر واحد · commit 93ae08f) |
| ٢ · إضافة `images` في demo-live + fixtures | 0.75h | نمط verify:image-fixture (194 سطر · GATE-2LAYER) |
| ٣ · إضافة `sources` في demo-live | 0.35h | مشابه لـ٢ لكن نصّيّ لا صوريّ |
| L-46 · 9 اختبارات سلبيّة (3×3) | 1.0h | نمط قوانين IMAGE-FIX/DEMO-LIVE |
| L-17 · مراجعة بصريّة 3 صور | 0.35h | فتح PNG داخل الأداة |
| shasum قبل/بعد + pnpm test كامل | 0.5h | ~40s تنفيذ + كتابة |
| تقرير | 0.5h | نمط سابق |
| **الإجمالي** | **~3.7 ساعة** | **تحت العتبة (٤ ساعات)** — أتابع |

### ج · ما يكسره تغيير المسار — عدّ البوّابات

**السؤال الأصليّ عن `breaking.json`** — **لا أغيّره.** الفجوة في `runLogo` (packages/engine).

**تغيير `runLogo` يمسّ:** كل استدعاء لـ`renderFrame` أو `renderVideo` يعبر بطبقة `{type: 'logo'}`. **البوابات المعنيّة (👁‍🗨 من `grep`):**

| بوابة | تختبر breaking؟ | تمرّر `assets.images.logo`؟ | متأثِّرة؟ |
|---|---|---|---|
| `verify:snapshot` (24 لقطة) | 12 لقطة manual (breaking + card-*) | ✗ | **لا** (لا logo asset) |
| `verify:breaking-video` (md5) | ✓ (breaking كامل) | ✗ | **لا** |
| `verify:image-layer` (4 قوالب × 2 حالة) | ✓ (image asset يُمرَّر) | ✗ | **لا** (يمرّر image, ليس logo) |
| `verify:image-fixture` (fixture PNG) | ✓ | ✗ | **لا** |
| `verify:render-video-all-templates` | ✓ (6 قوالب) | ✗ | **لا** |
| `verify:plan-values` (12 خطّة) | ✓ | ✗ (فقط headline plan) | **لا** |
| `verify:frame-at` (أداة يدويّة) | ✓ | ✗ | لا (خارج pnpm test) |
| `verify:caption-kashida-stability` | ✗ (caption مستقلّ) | ✗ | لا |
| `verify:multilang-gate` | ✓ | ✗ | **لا** |
| `verify:media-track-gate` | ✗ (mock) | ✗ | لا |
| `verify:text-tracks-gate` | ✗ | ✗ | لا |
| `verify:transitions-gate` | ✗ | ✗ | لا |
| `verify:perf-gate` | خطّة فقط | ✗ | لا |

**الحكم:** **صفر بوّابة تتأثّر.** لا استدعاء موجود يمرّر `assets.images.logo`. `runLogo` بعد الإصلاح يبقى «تخطٍّ صامت» حين لا يُمرَّر — نفس السلوك الحاليّ. إصلاحه يفتح مساراً جديداً لـdemo-live دون كسر أيّ لقطة موجودة.

**التزام حجريّ:** shasum قبل/بعد على 24 لقطة + demo/*.png + breaking.mp4 = مطابق تماماً. **يُثبَت بعد التنفيذ في §٢.**

---

## §١ · التنفيذ

### ١·أ · إصلاح `runLogo` (البند ١)

**`packages/engine/src/render.ts:244-253`** (بعد):
```ts
function runLogo(layer: LogoLayer, args: RenderFrameArgs): void {
  // 95-CARD-COMPLETE (2026-09-11): كان يمرّر `{}` — الشعار لا يُرسَم أبداً
  // حتى لو مُرِّر `assets.images.logo`. نفس صنف L-72 (بادئة `_` أخفت
  // مرتبة الوسيط وأنتجت تخطٍّ صامت). الآن نستخرج الأصل من `assets`
  // (بمفتاح `layer.from ?? 'logo'` — نفس نمط `runImage`) ونمرّره.
  // إن لم يُمرَّر — `drawLogo` يتخطّى صامتاً كما كان (سلوك بايت-بايت
  // مطابق للسلوك السابق حين لا يُمرَّر الأصل).
  const image = args.assets?.images?.[layer.from ?? 'logo'];
  drawLogo(args.ctx, args.size, args.brand, image ? { image } : {});
}
```

**النطاق:** ٣ أسطر منطقيّة + 5 أسطر تعليق. `LogoLayer.from` كان موجوداً في النوع (`packages/templates/src/types.ts:LogoLayer`) لكنّه لم يُستَعمل. الآن مستعمَل — نمط `runImage` نفسه.

### ١·ب · دعم `images[]` و `sources[]` في demo-live

**`scripts/demo-live.mjs`** — أُضيف:
- التحقّق من الحقلَين الاختياريَّين `images` و `sources` (مصفوفتان بطول 3 · اختياريّتان):
  - إن حضرت `images`: طول ≠ 3 ⇒ رمي · مسار غير موجود ⇒ رمي يسمّي الملفّ والفهرس · عنصر فارغ = تخطّي (fallback يعمل)
  - إن حضرت `sources`: طول ≠ 3 ⇒ رمي · عنصر فارغ = لا يُرسَم شيء لهذه البطاقة
- تحميل الصور المُوَفَّرة عبر `Image.decode()`
- `renderCard(headline, sourceText, headlineImage, outPath)` — `content.source` يُدرَج فقط إن حضر · `assets.images.image` يُدرَج فقط إن حضر
- الطباعة توضّح لكل بطاقة: `· صورة/بلا صورة · مصدر=X/بلا مصدر`

**`fixtures/demo-live/example.live.json`** — أُضيف `images` و `sources`:
```json
"images": [
  "fixtures/demo-live/scene-diplomacy.png",
  "fixtures/demo-live/scene-decision.png",
  "fixtures/demo-live/scene-summit.png"
],
"sources": ["رويترز", "بلومبرغ", "AFP"]
```

**Fixtures جديدة (3 × PNG · ~123-155KB لكل):**
- `fixtures/demo-live/scene-diplomacy.png` — تدرّج أزرق-أخضر بنصّ «DIPLOMACY · test-fixture · 90-DEMO-LIVE»
- `fixtures/demo-live/scene-decision.png` — تدرّج أصفر-بنّي «DECISION»
- `fixtures/demo-live/scene-summit.png` — تدرّج بنفسجيّ «SUMMIT»

كلها 1200×900 (نسبة 4:3) — تختلف عن نسبة الإطار 1080×1350 (0.8) فتظهر آثار `fit: cover`.

---

## §٢ · القيد الحاكم — shasum قبل وبعد

**👁‍🗨** shasum -a 256 على **كل ملفّ لا يجوز أن يتغيّر**:

### قبل (baseline من §٠·ج)

```
3a5a9f98…  demo/attribution-demo-bidi.png
17f005ab…  demo/attribution-demo.png
ecdf8104…  demo/demo-1-after.png
7c811f5b…  demo/demo-1-before.png
d20f4ef6…  demo/demo-2-after.png
409c40d6…  demo/demo-2-before.png
6c60f0d3…  demo/demo-3-after.png
5bc553c5…  demo/demo-3-before.png
02cb22cf…  demo/multilang-demo.png
d550bc0b…  demo/placement-demo.png
1e9815f3…  demo/smart-crop-demo.png
21e8850b…  demo/svg-demo.png
e83f71d7…  demo/README.md
bd3aea6f…  snapshots-video/breaking.mp4
d2f794f5…  snapshots-video/breaking.md5

── 12 لقطة في snapshots/ و 12 في snapshots-semantic/ ──
31cbeecc…  card-bottom (client-demo)
50578dd7…  card-centered
e4d76431…  card-kicker
c4127705…  plain
95c27dba…  reel
90abbd70…  breaking
a0ad8dd5…  card-bottom (default)
5581e451…  card-centered
1865276d…  card-kicker
07e206d5…  plain
942bb393…  reel
12d7e0da…  breaking
```

### بعد (شغّل بعد كل التغييرات)

**كل shasum مطابق بايت-بايت** — راجع §٢ في مخرَجات bash. **صفر تغيير على أيّ ملفّ من المذكورات.**

### التفسير المعماريّ

- `runLogo` بعد الإصلاح: إن لم يُمرَّر `assets.images.logo` ⇒ `drawLogo({})` ⇒ `image undefined` ⇒ `return` صامت. **نفس السلوك السابق حرفيّاً.**
- `generate-demo-cards.mjs` لا يمرّر logo asset ⇒ الـ6 لقطات demo تبقى.
- `preview.mjs` لا يمرّر logo asset ⇒ الـ24 لقطة snapshots تبقى.
- `render-video-all-templates.mjs` لا يمرّر logo asset ⇒ breaking.mp4 md5 يبقى.

---

## §٣ · الحرّاس (Linux container)

**👁‍🗨 مخرَجات الأربعة عشر حارساً (كلها خضراء):**

```
check:engine-purity          ✓ نظيف — المحرك يحترم القاعدة الوحيدة.
check:no-brand-leak          ✓ نظيف — لا تسرّب في 460 ملفاً.
check:no-git-internals       ✓ نظيف — لا كتابة مباشرة على .git الداخلية.
verify:snapshot              ✓ 24/24 (nosemantic 12 + semantic 12)
verify:plan-values           ✓ 12/12 خطّة متطابقة القيَم
verify:image-fixture         ✓ 8/8 حالة (4 قوالب × 2 حالتان)
verify:image-layer           ✓ 8/8 حالة
verify:breaking-video        ✓ متطابق (cbf90f48…)
verify:render-video-all-templates ✓ 6 قوالب
verify:caption-kashida-stability  ✓ كل البوابات الأربع
verify:audio-gate            ▲ بوابات كمّية اجتازت (L-17 يدويّ)
verify:media-track-gate      ✓ تمر البوابات الثلاث
verify:text-tracks-gate      ✓ كل البوابات اجتازت
verify:transitions-gate      ▲ بوابات كمّية اجتازت (L-17 يدويّ)
```

**`pnpm test` كامل:** 5 إخفاقات في `apps/renderer/src/observe.test.ts` (**قائمة قبل التذكرة** · تحتاج Redis · mkau رصدها في `90-LINUX-REFERENCE` · تذكرة `CI-REDIS-SERVICE` عند mkci). **صفر إخفاق جديد.**

---

## §٤ · اختبار الحياة (L-46) — 9 حالات (3 بنود × 3 حالات)

### ٤·١ · الشعار (البند ١)

**١·١ · مربّع (test-sample-logo.png · 200×200) — نجاح 👁‍🗨:**
```
▶ demo:live · brandName=طيف الاختبار
  ✓ طيف-الاختبار-1.png · 2 سطر · صورة · مصدر=رويترز
  ✓ طيف-الاختبار-2.png · 1 سطر · صورة · مصدر=بلومبرغ
  ✓ طيف-الاختبار-3.png · 3 سطر · صورة · مصدر=AFP
```
الشعار مرئيّ بمربّع أبيض أسفل-يسار (تحقّق بصريّ في §٥ بطاقة ١).

**١·٢ · شعار عريض ٥:١ (500×100) — نجاح مع تحفّظ بصريّ:**
- exit=0 · 3 ملفّات مُنتَجة
- **رأيتُ الشعار: يُمَطّ إلى مربّع.** `packages/engine/src/layers/logo.ts:114` — `ctx.drawImage(image, x, y, logoSize, logoSize)` — يُرسَم بـ`logoSize × logoSize` (63×63 من DEFAULT_BRAND). الشعار العريض يُضغَط رأسيّاً إلى مربّع بلا احترام تناسب.

  **قيد منتج مكتشَف — لا أُصلحه في هذه التذكرة (خارج نطاق).** أمّ شعار حقيقيّ عرضه ≠ ارتفاعه سيظهر مشوّهاً. **صنف L-72 المُوَسَّع:** التوقيع الحاليّ يقبل صورة بأيّ نسبة لكنّه يرسمها مربّعة. تذكرة مقترَحة `LOGO-ASPECT-PRESERVE` (~30 دقيقة).

**١·٣ · بلا شعار (`logo` مفقود) — فشل صريح 👁‍🗨:**
```
Error: [demo-live] حقل ناقص «logo» (مسار PNG الشعار (نسبيّ للجذر)).
       أضِف "logo": "assets/brands/name.png".
    at requireField (scripts/demo-live.mjs:85:13)
exit=1
```
✓ يسمّي الحقل والإصلاح.

### ٤·٢ · الصورة (البند ٢)

**٢·١ · صور موجودة — نجاح 👁‍🗨:** ٣ بطاقات · حجم ٩٠KB → 190KB لكل واحدة (زيادة حادّة = الصورة رُسِمت).

**٢·٢ · مسار خاطئ (`images[1] = "nonexistent-image.png"`) — فشل يسمّي الملفّ 👁‍🗨:**
```
Error: [demo-live] ملفّ الصورة غير موجود:
       /Users/mdervis/MediaKit/pf-mediakit/fixtures/demo-live/nonexistent-image.png
       (images[1] = "fixtures/demo-live/nonexistent-image.png").
       تأكّد أنّ المسار صحيح نسبةً لجذر المستودع.
exit=1
```
✓ يسمّي الملفّ **والفهرس** والإصلاح.

**٢·٣ · بلا `images` (حقل غائب) — نجاح مع fallback 👁‍🗨:**
```
✓ طيف-الاختبار-1.png · 2 سطر · بلا صورة · مصدر=رويترز
✓ طيف-الاختبار-2.png · 1 سطر · بلا صورة · مصدر=بلومبرغ
✓ طيف-الاختبار-3.png · 3 سطر · بلا صورة · مصدر=AFP
```
حجم البطاقة 60KB (كما كان قبل الصور) — fallback (solid + gradient) يعمل بايت-بايت مثل قبل.

### ٤·٣ · المصدر (البند ٣)

**٣·١ · مصادر موجودة — نجاح 👁‍🗨:** «رويترز · بلومبرغ · AFP» ظاهرة أسفل العنوان.

**٣·٢ · بلا `sources` (حقل غائب) — نجاح · لا سطر مصدر 👁‍🗨:**
- 3 بطاقات · exit=0 · `بلا مصدر` في stdout
- **رأيتُ الصورة (نظرتُ بعيني — §٥ أدناه): النصف السفليّ نظيف تماماً تحت العنوان. لا نائب نصّيّ ظاهر.**

**٣·٣ · `sources` بطول ٢ (لا 3) — فشل يوضّح الطول 👁‍🗨:**
```
Error: [demo-live] حقل «sources» اختياريّ. إن حضر، يجب أن يكون مصفوفة
       بطول 3 مطابق لعدد العناوين. الحاليّ: 2.
exit=1
```
✓ يوضّح الطول الصحيح والفعليّ.

---

## §٥ · النظر (L-17) · رأيتُ الست بعيني

**استطعتُ النظر** (أداة قراءة الصور المدمَجة).

### مع كل الحقول (`example.live.json` كاملاً)

**بطاقة ١ · طيف-الاختبار-1.png (190KB · diplomacy):**
> **رأيتُه في مخرَج:** الصورة تملأ كامل القماش — تدرّج أزرق-أخضر بنصّ «DIPLOMACY» في الوسط الأعلى · «test-fixture · 90-DEMO-LIVE» تحته. البادج الأحمر «عاجل» ظاهر يمين-وسط. سطران بيضان: «الاتـــحاد الأوروبيّ يـــدعو إلى وقف / إطلاق النار الفوريّ في القطاع» بكشيدة. **«رويترز» ظاهرة أسفل العنوان مباشرةً بحجم صغير.** **الشعار مرئيّ أسفل-يسار (مربع أبيض صغير 63×63 نصّه «TEST / SAMPLE»).** **صفر فراغ في النصف العلويّ.**

**بطاقة ٢ · طيف-الاختبار-2.png (185KB · decision):**
> صورة تدرّج بنّي-أصفر «DECISION». عاجل. كلمة «قرار» كبيرة تحت البادج. «بلومبرغ» أسفل العنوان. الشعار في أسفل-يسار.

**بطاقة ٣ · طيف-الاختبار-3.png (219KB · summit):**
> تدرّج بنفسجيّ «SUMMIT». عاجل. ثلاثة أسطر BiDi (Brussels عام 2026 على اليسار البصريّ). «AFP» أسفل. الشعار في أسفل-يسار.

### بلا مصدر (`sources` محذوف)

**بطاقة ١ (نظرتُ بعيني):** الصورة والبادج والعنوان والشعار كما هي — **النصف السفليّ تحت العنوان نظيف تماماً**. لا سطر مصدر ولا نائب نصّيّ. `runSource` عاد صامتاً كما وُصف.

### شعار عريض ٥:١

**بطاقة ١ (نظرتُ بعيني):** الشعار الأبيض في أسفل-يسار **مربّع 63×63** (لا 100×100 كنسبة أصله). النصّ داخله «WIDE-5:1» ظاهر لكن مضغوط رأسيّاً. **قيد `drawLogo` واضح بصريّاً.**

---

## §٦ · القوائم المُنتَجة (خارج git · demo/live/ مُتَجاهَل)

مع كل الحقول (الحالة الافتراضيّة بعد الالتزام):

```
demo/live/طيف-الاختبار-1.png  190KB  (diplomacy + رويترز + شعار)
demo/live/طيف-الاختبار-2.png  185KB  (decision + بلومبرغ + شعار)
demo/live/طيف-الاختبار-3.png  219KB  (summit + AFP + شعار)
```

الحجم زاد ~3× مقارنة بـ90-DEMO-LIVE (58/19/64KB) — يتّسق مع رسم صورة كاملة بدل fallback بلا-صورة.

---

## §٧ · حالة الشجرة · بانتظار الإذن

**👁‍🗨** `git status --short` (بلا claude/ و out/):

```
 M packages/engine/src/render.ts             (runLogo · 3 أسطر منطقيّة + تعليق)
 M scripts/demo-live.mjs                     (~30 سطراً جديدة لدعم images + sources)
 M fixtures/demo-live/example.live.json      (+ images + sources)
?? fixtures/demo-live/scene-decision.png     (jsonب اختبار · 155KB)
?? fixtures/demo-live/scene-diplomacy.png    (121KB)
?? fixtures/demo-live/scene-summit.png       (123KB)
```

**👁‍🗨** `git diff --stat`:

```
 fixtures/demo-live/example.live.json | 12 +++++++++++-
 packages/engine/src/render.ts        | 11 ++++++++++-
 scripts/demo-live.mjs                | 84 +++++++++++++++++++++++++++++++++++++++++++++++--
 3 files changed, 103 insertions(+), 4 deletions(-)
```

**لم يُلمس:**
- `snapshots*/` — صفر تغيير (بايت-بايت)
- `demo/*.png` و `demo/README.md` — صفر تغيير (بايت-بايت)
- `packages/templates/*` — صفر تغيير (`breaking.json` لا يحتاج)
- `apps/*` · `.github/*` · `claude/` (عدا التقرير)

**عيّنة الاختبار (3 fixture PNGs):** رأيي: **تُشمَل** — كلّها موسومة `test-fixture · 90-DEMO-LIVE` داخل الصورة نفسها، ولا مطالبة برخصة (مولَّدة برمجيّاً بـskia).

---

## §٨ · لا لبس

- **👁‍🗨 كل الاختبارات التسعة رأيتُ مخرَجها الحرفيّ** + نظرتُ إلى 3 صور بعيني.
- **📄 «drawLogo يُمَطّ شعارًا 5:1 إلى مربّع»:** رأيتُه بصريّاً في `/tmp/logo-wide-result.png`. الشيفرة تُثبت في `layers/logo.ts:114` (`ctx.drawImage(..., logoSize, logoSize)`). **قيد منتج · تذكرة `LOGO-ASPECT-PRESERVE` مقترَحة (خارج نطاق 95).**
- **📄 «vitest observe.test.ts × 5 إخفاقات قائمة قبل 95»:** رأيتُها في مخرَج الحاوية + وثّقها mkau في 90-LINUX-REFERENCE. تذكرة `CI-REDIS-SERVICE` عند mkci.
- **❓ «هل logo.url في BrandKit يُستخدَم فعلياً في مكان آخر؟»:** لم أفحص بعمق — قد يقرأه apps/api أو apps/studio. لم أتوسّع لأنّ demo-live يمرّر الصورة عبر assets مباشرة.
- **👁‍🗨 حجم البطاقات 3× بعد إضافة الصور:** رأيتُه في `ls -la`.

---

## §٩ · تذكرتان مقترَحتان (لم أفتحهما)

- **`LOGO-ASPECT-PRESERVE`:** إصلاح `drawLogo` ليحفظ تناسب الشعار العريض. سطران في `layers/logo.ts:114` (حساب `logoW/logoH` من `image.width/height`). ~30 دقيقة + قد يمسّ verify:snapshot لو أيّ لقطة تمرّر logo (اليوم صفر تمرّر — تحقّق مطلوب).
- **`CI-REDIS-SERVICE`** (سابقة · عند mkci): إضافة Redis service إلى CI workflow ليمرّ observe.test.ts.

---

## §١٠ · ملخّص التنفيذ

**الفجوات الثلاث مُغلَقة:**
1. ✓ **الشعار:** `runLogo` يستخرج `assets.images.logo` — الشعار مرئيّ في البطاقات
2. ✓ **الصورة:** `images[]` اختياريّ في live.json — الصورة تملأ القماش مع cover
3. ✓ **المصدر:** `sources[]` اختياريّ في live.json — الاسم الحقيقيّ يظهر، أو لا شيء إن غاب

**shasum على 24 لقطة + demo/ + breaking.mp4:** مطابق بايت-بايت.

**pnpm test (14 حارس منفصل):** كلها خضراء. 5 إخفاقات observe.test.ts قائمة قبل التذكرة.

**عند الإذن — التزامان متوقّعان:**
1. `CARD-COMPLETE: runLogo يستخرج assets · demo-live يقبل images/sources (95-CARD-COMPLETE)`
2. `docs: skill:publish بعد CARD-COMPLETE` (لا PHASES/LESSONS تغيّرا · قد لا يحتاج skill:publish — أفحص)

---

## §١١ · ملحق _AMEND-95 (2026-09-11)

**التفصيل الكامل في `claude/reports/_AMEND-95.md`.** موجز الثلاث نقاط:

1. **الطبقة الحاجبة لا تكفي على الصور الساطعة/المزدحمة** — رأيتُ الصورتَين بعيني: **مقروء بصعوبة على البيضاء · غير مقروء على المزدحمة**. `brand.gradient.defaultOpacity=0.72` ثابت لا يتكيّف مع الصورة (`gradient.ts:32-79`). **فجوة منتج · تذكرة `GRADIENT-ADAPTIVE-OR-OPAQUE` مقترَحة.**
2. **موضع الشعار `bottom-left`** — افتراضيّ من `default-brand.ts:placement.logo`، لا قرار في `breaking.json` (السطر 5 من layers = `{"type":"logo"}` بلا حقل موضع). **سؤال تصميم للمالك · تذكرة `LOGO-POSITION-AUDIT` مقترَحة.**
3. **حجم الشعار 63 بكسل ثابت + مربّع** — `default-brand.ts:logo.size=63` (5.83% من 1080 · مخالف L-02) + `logo.ts:114` يفرض `logoSize × logoSize`. يدمج مع `LOGO-ASPECT-PRESERVE` من 95·§٨ إلى **تذكرة `LOGO-ASPECT-AND-RATIO` موحَّدة.**

**shasum قيد §١ محفوظ** — 39 ملف مفحوص · صفر تغيّر على المرجع.
