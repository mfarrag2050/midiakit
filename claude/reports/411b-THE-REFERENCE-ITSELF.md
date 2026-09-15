# ٤١١ب · المرجعُ نفسُه — تقريرٌ كامل (استلامٌ من التسليم الجزئيّ عند 98%)

**استلمتُ التسليم.** الجلسة: mediakit · main عند `6c7f28b` قبل التغيير · قرأتُ 350 كاملاً و 411ب الجزئيّ قبل أيّ فعل. **لم أدفع** · **لم ألمس الطقمَ الحيّ**.

---

## 🔒 الحكم في السطر الأوّل

**«الآلة تنسخ» ليست تعبيراً مجازيّاً — كانت الحقيقة.** ولكنّ العطبَ لم يكن في `preview.mjs` نفسه (يفَرِّق بايتاً بايتاً بين `--semantic=on/off` اليوم). العطبُ في **غياب آلة إعادة توليدٍ حقيقيّة** — كلّ تجديد كان `cp` يدويّاً · صنّاع b4ce12e نَسخوا بدل التوليد. **الفخّ سُدَّ الآن بثلاث لُبنات:** سكربتٌ صريح، وصلٌ لـ`bin/mk-ci --regen-refs`، حارسٌ يفشل عند عودة النسخ الكامل.

**البكسلاتُ في `snapshots/` (24 و 63 بايت):** IDAT decompressed مختلفة — **درفتٌ حقيقيّ**. المسبّب مُسمّى: **`e3ea574` (99G-SOURCE-LEFT · 2026-09-12)** — قَلَبَ محاذاة سطر المصدر من `right` إلى `left` في `runSource`. الادّعاء في نصّ الالتزام «لم يمسّ أيّ لقطة (preview.mjs لا يمرّر assets.images)» **خاطئ** — يخصّ طبقةَ الصورة، لا سطرَ المصدر.

---

## §١ · فخّ النسخ · قيسَ حرفيّاً

قبل التجديد (HEAD=`6c7f28b`):

```
$ for f in snapshots/*.png; do
    a=$(md5 -q "$f"); b=$(md5 -q "snapshots-semantic/$(basename $f)")
    [ "$a" = "$b" ] && echo "IDENTICAL $(basename $f)" || echo "DIFFERENT ..."
  done | grep -c IDENTICAL

  12
```

**١٢/١٢ متطابقة بايت-بايت.** `snapshots-semantic/` قناعٌ ادّعى حراسةَ ١٢ حالة دلاليّة وحرَس صفراً منها منذ 4ca3242 (2026-09-02). كلّ تجديدٍ (`c915e61` · `b4ce12e`) أنتج نسخةً بلوغيّةً جديدة بلوب-هاش · لكنّ الملفَّين ظلّا متطابقَين.

## §٢ · فرقُ ٢٤ و ٦٣ بايت — قسمٌ-قسم بـpython stdlib

سكربتٌ خاصّ (`/tmp/411b-png-chunks.py` · `struct + zlib + hashlib` · **بلا Pillow · بلا pngcheck**):

### أ · `snapshots/preview-default.png` (Δ=+24 بايت مقابل رندر جديد)

| قِياس | مرجع | جديد | حكم |
|---|---:|---:|---|
| IHDR/pHYs/sRGB/sBIT | كلٌّ متطابق md5 | كلٌّ متطابق md5 | **SAME** |
| tEXt/iTXt/tIME/gAMA/iCCP | غير موجودة | غير موجودة | — |
| IDAT · عدد chunks | 9 | 9 | تجزّئٌ ثابت |
| **IDAT compressed** | 69806b · `f7f9db1637a5` | 69830b · `dca21675479e` | **DIFF** |
| **IDAT decompressed** | 5833350b · `bffc74f99ce0` | 5833350b · `530413b3b482` | **DIFF · 8744 بايتاً بكسليّاً (0.15%)** |

### ب · `snapshots/preview-client-demo.png` (Δ=-63 بايت)

| قِياس | مرجع | جديد | حكم |
|---|---:|---:|---|
| IHDR/pHYs/sRGB/sBIT | كلٌّ متطابق md5 | كلٌّ متطابق md5 | **SAME** |
| tEXt/iTXt/tIME | غير موجودة | غير موجودة | — |
| IDAT · عدد chunks | 8 | 7 | تجزّئٌ زحزح |
| **IDAT compressed** | 57387b · `a0a49040461a` | 57336b · `c225b46544c5` | **DIFF** |
| **IDAT decompressed** | 5833350b · `10a75ab171ff` | 5833350b · `2275d69d0d2b` | **DIFF · 7085 بايتاً بكسليّاً (0.12%)** |

### الحكم الحاسم

**IHDR + pHYs + sRGB + sBIT متطابقة md5 حرفيّاً · لا chunks metadata أخرى.** الفرق **في IDAT وحده، ومفكوكاً**. فرضيّة «بيئيّ (tEXt/tIME/libpng)» **مرفوضة**. **البكسلاتُ نفسُها تغيّرت** · درفتُ رندرٍ.

## §٣ · اسمُ المسبّب — `e3ea574` (99G-SOURCE-LEFT)

بحثتُ في التزامات مرحلة `b4ce12e..HEAD` التي تلمس `packages/engine/` و `packages/templates/` — 9 التزامات. اثنان صرّحا صراحةً «صفر تغيير بايت» في نصّهما (`aa6ade2` SCRIM · `941955b` runLogo · كلاهما محميٌّ بشرط `onlyIf=hasImage` أو `assets.images.logo` لا يمرّرهما preview.mjs · صحيحان).

`e3ea574` (2026-09-12 20:47) بخلاف ذلك — قلبَ **آليّة سطر المصدر** في `runSource`:

```diff
- args.ctx.textAlign = 'right';
- args.ctx.fillText(text, bounds.right, baseline);
+ const align = args.brand.placement?.source?.align ?? 'left';
+ if (align === 'right') { ... bounds.right }
+ else if (align === 'center') { ... }
+ else { args.ctx.textAlign = 'left'; args.ctx.fillText(text, bounds.left, baseline); }
```

وفي `packages/shared/src/default-brand.ts:241`:
```javascript
source: { anchor: 'bottom-right', offset: {...}, align: 'left' }
```

**الأثرُ المُقاس:**
- سطر «مصدر طبي — مراسلنا» كان يُرسم عند حافّة العنوان اليمنى ⇒ صار عند اليسرى.
- **يفعّل في القالبَين اللذَين يحملان طبقةَ `source`:** breaking + reel. `preview-default.png` و `preview-client-demo.png` كلاهما breaking.
- 8744 بايتاً بكسليّاً في default (سطر ~20 حرفاً عربيّاً بحجم 34pt) · 7085 في client-demo (نصّ مختلف · حجم 38pt) — الفرق بين الحجمَين يفسّر الفرق في عدد البكسلات المتأثّرة.

**نصّ الالتزام قال:** «لم يمسّ أيّ لقطة محميّة (preview.mjs لا يمرّر assets.images).» — الجملة صحيحة عن **طبقة الصورة** التي محميّة بـ`onlyIf=hasImage`. لكنّ **طبقة `source`** لا تعتمد الصور أبداً — تُرسم دائماً حين الحقل موجود. الادّعاء إذاً **يخصّ الاختصاص الخطأ**.

**لماذا لم يُكشف حتى اليوم؟** حتى GATE-2LAYER (`b4ce12e`)، `verify:snapshot` كان **خارج** `pnpm test`. بعده وُصل، لكن على macOS يفشل fail-loud بلا تشغيل. لا CI أضاء `verify:snapshot` على main. **صدفةً موثوقة:** لولا 350 (mkci · «هل اللقطات تعمل أصلاً؟»)، لظلّت الدرفة تنمو.

## §٤ · إصلاحُ المولّد — ثلاث لُبنات

### أ · `scripts/regen-visual-refs.mjs` (جديد · 87 سطراً)

يفصل بين **توليد الرندر** و**تعيين المرجع**:
1. يفترض `preview.mjs` رُكض 4 مرّات قبله (2 هويّتَين × 2 وضعَي دلالي) · مخرَجه في `out/{nosemantic,semantic}/`.
2. يَنسخ **الكشيدة فقط** إلى `snapshots/` و `snapshots-semantic/` على التوالي — **لا نسخٌ بين المرجعَين أبداً**.
3. يطبع per-file delta (md5 قبل → بعد · Δbytes).
4. يفحص أخيراً أنّ اختلافاً واحداً على الأقلّ يظهر بين المرجعَين — إن كانت 12/12 متطابقة، يُفشل بصوت (فخّ النسخ عاد).

### ب · `bin/mk-ci --regen-refs` (كان stub منذ 2026-09-11)

كسر السطب. الآن يُشغّل حاوية Linux (`node:20.18.1-bookworm-slim` · بلا pg/redis · verify:snapshot لا يحتاجها):
1. `pnpm install --frozen-lockfile`
2. حلقة `for brand × semantic: node preview.mjs`
3. `node scripts/regen-visual-refs.mjs`

بلا pg/redis: زمن التشغيل الفعليّ **~2 دقيقة** (مقيسٌ في §٥).

### ج · `scripts/check-snapshots-not-all-copies.mjs` (جديد · 60 سطراً · **غير موصول بعدُ**)

حارسٌ مستقلّ: يفحص snapshots/ ↔ snapshots-semantic/ · يفشل إن كانت **جميع** الملفّات متطابقة. الآن `2/12 مختلفة` ⇒ أخضر. يُوصَل في `pnpm test` **بعد قبول المالك للتجديد** (`check:snapshots-not-all-copies` بين `check:template-drift` و `check:migration-timestamp-collision`).

**اختيار المعيار (وحيدٌ يختلف · لا الكلّ):** بعض المحتوى لا يُشغِّل الكسر الدلاليّ (client-demo · card_kicker · reel) — تطابقُهُ حقيقة · لا فخّ. لكنّ **صفر فارق مطلقاً** يعني أنّ `--semantic=on` لم يُنتج بايتاً واحداً مختلفاً · **ذلك الفخّ**.

## §٥ · التجديد الفعليّ في Linux — كم كنّا عميَاناً

شغّلتُ `./bin/mk-ci --regen-refs` (`/tmp/411b-regen.log` · حاوية `node:20.18.1-bookworm-slim` · arm64 · 2026-09-15 · main tree):

### `snapshots/` (nosemantic · 2 من 12 تُغيّر)

| ملفّ | md5 قبل | md5 بعد | Δbytes |
|---|---|---|---:|
| `preview-default.png` | `228ad596ea9f` | `d2c2ae00d184` | **+24** |
| `preview-client-demo.png` | `8503a789cc0d` | `cbacfab69742` | **-63** |
| 10 ملفّات أخرى | — | (كما هي) | 0 |

⇒ **درفت 99G-SOURCE-LEFT مقبولاً** بالتجديد. سطر المصدر في breaking صار على اليسار في المرجع كما هو في الرندر الفعليّ.

### `snapshots-semantic/` (semantic · 3 من 12 تُغيّر)

| ملفّ | md5 قبل | md5 بعد | Δbytes | السبب |
|---|---|---|---:|---|
| `preview-default.png` | `228ad596ea9f` | `9e19717a482a` | **-15757** | الكسر الدلاليّ فَعَل + درفت 99G |
| `preview-default-plain.png` | `801b0bf18c3a` | `171f9ced7eba` | **-15239** | الكسر الدلاليّ فَعَل |
| `preview-client-demo.png` | `8503a789cc0d` | `cbacfab69742` | **-63** | درفت 99G وحدها (الدلاليّ لا يُشغَّل على client-demo) |
| 9 ملفّات أخرى | — | (كما هي) | 0 |

⇒ **٣ تفارقات دلاليّة حقيقيّة كانت مخبَّأة تحت النسخ**:
- **~15 كيلوبايت** لكلّ من `preview-default.png` و `preview-default-plain.png` (semantic breaker يقلّص عدد الأسطر بترميز HEADLINE_LONG المعرَّف صراحةً بـ«الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع» → 3 أسطر بدل 4).
- **~63 بايت** في `preview-client-demo.png` (درفت 99G وحدها · الكسر الدلاليّ لا يُشغَّل).

**«كم كنّا عميَاناً»:** ٣ تفارقات حقيقيّة كامنة لـ٤ أيّام (11-09 → 15-09). اثنتان منها **جوهر ما يفترض أن يحرسه `snapshots-semantic/`** — أي أنّ الحارس كان أعمى عن الميزة التي وُلد ليحرسها.

## §٦ · التحقّق النهائيّ · 24/24 أخضر

بعد التجديد، شغّلتُ `pnpm verify:snapshot` داخل نفس الحاوية:

```
[verify-snapshot] النتائج:
  nosemantic  12 مطابقة · 0 إخفاق · من 12 لقطة
  semantic    12 مطابقة · 0 إخفاق · من 12 لقطة
```

**24/24 · صفر إخفاق.** والحارسُ الجديد `check-snapshots-not-all-copies.mjs`:
```
snapshots/ = 12 · snapshots-semantic/ = 10 متطابقة · 2 مختلفة · 0 مفقودة
  ✓ 2/12 ملفّاً يُثبت أنّ --semantic=on فَعَل شيئاً.
```

## §٧ · حالة الشجرة قبل الدفع

```
$ git status --short
 M bin/mk-ci
 M snapshots-semantic/preview-client-demo.png
 M snapshots-semantic/preview-default-plain.png
 M snapshots-semantic/preview-default.png
 M snapshots/preview-client-demo.png
 M snapshots/preview-default.png
 ?? scripts/regen-visual-refs.mjs
 ?? scripts/check-snapshots-not-all-copies.mjs

$ git log --oneline main..HEAD   # صفر التزامات جديدة
```

**5 ملفّات مرجعيّة تغيّرت · 1 سكربت CI تُغيّر (bin/mk-ci) · 2 سكربتَين جديدَين (regen + check) · صفر التزامات.** المالك يراجع بـ`git diff snapshots/` (فَرَش binary) قبل الالتزام.

## §٨ · قرارُ المالك — تعليقٌ إلى ما بعد التذكرة اللاحقة

المالك قرأ التقرير الأوّل وحكم بنقطتَين (٢٠٢٦-٠٩-١٥ · بعد تسليم §٧ أعلاه):

### (ب) نعم — الحارس مُوَصَّل في `pnpm test` · **مُنفَّذ**

`package.json:30` نصٌّ جديد: `"check:snapshots-not-all-copies": "node scripts/check-snapshots-not-all-copies.mjs"`. وفي سلسلة `test` بين `check:template-drift` و `check:migration-timestamp-collision`.

**L-46 red-then-green · مُقاسٌ في هذه الجلسة:**
| مرحلة | الملفّات في `snapshots-semantic/` | مخرج الحارس | exit |
|---|---:|---|---:|
| ابتداءً (بعد تجديد) | 10 متطابقة · 2 مختلفة | أخضر «--semantic=on فَعَل» | **0** |
| فَبْركةُ أحمر (cp من snapshots/) | 12 متطابقة · 0 مختلفة | «✗ فخّ النسخ» + رابط `bin/mk-ci --regen-refs` | **1** |
| استعادة (نسخ عكسيّ من /tmp) | 10 متطابقة · 2 مختلفة | أخضر مستعاد | **0** |

الحارسُ يحمرّ عند بالضبط ما انكشف الليلة · لا حساسيّةَ زائدة · لا صمتاً.

### (أ) لا · لا قبولاً ولا رفضاً بعدُ — سؤالٌ أعمق مُطرَح

المالك: «هل كان قلبُ المحاذاة من `right` إلى `left` صواباً أصلاً في تخطيطٍ عربيّ من اليمين إلى اليسار؟» **قبل الحكم أُجيبُ عن ثلاثة:**

#### ١ · لماذا قُلبت — نيّةٌ مصرَّح بها

نصّ `e3ea574` صريحٌ في السطر الأوّل: «قرار المالك (أسلوب البيت): سطر الوكالة في «عاجل» يُحاذي الحافّة اليسرى لكتلة العنوان، لا اليمنى.» **نيّةٌ مصرَّح بها · لا أثرٌ جانبيّ.** أُقرَّت بمقياس بكسليّ (`scripts/99G-measure-source.mjs`) و 6 لقطات مقارنة رأى المالكُ ٣ منها.

#### ٢ · بعينَي قارئٍ عربيّ — الصورتان

فتحتُ `snapshots/preview-default.png` (الخلفيّة الرماديّة) و `snapshots/preview-client-demo.png` (الخلفيّة الكحليّة · شعار «خبر عاجل»).

- **العنوان (3 أسطر عربيّ RTL):** «ارتفاع عدد الضحايا جراء الاستهداف / الإسرائيليّ المتواصل لمنتظري / المساعدات شمالي القطاع» — يحاذي الحافّةَ اليمنى الطبيعيّةَ للعربيّة.
- **سطر المصدر «مصدر طبي — مراسلنا»:** يقع عند **الحافّة اليسرى الفيزيائيّة للقماش**، أسفلَ العنوان بمسافةٍ نصف بوصةٍ تقريباً.

**عربيّاً، القارئُ يبدأ من اليمين وينتهي إلى اليسار.** سطرُ المصدر عند اليسار الفيزيائيّ = **نهاية المسار القرائيّ** = التقليدُ الصحفيّ العربيّ الشائع (الإسناد بعد النصّ · اقرأ ثمّ اعرف المصدر). **الرندرُ عربيّاً صواب.**

#### ٣ · فيزيائيٌّ أم منطقيّ — سطرٌ واحد

**`align: 'left'` في `runSource` (`packages/engine/src/render.ts:986` + `default-brand.ts:241`) قيمةٌ فيزيائيّةٌ متعمَّدة · تقصد منطقيّاً `end` بالنسبة لـRTL · وآليّةُ `mirrorOnLTR` عند `locale.ts:82` تعكس `anchor` وحدَه — لا `align` — فأيّ هويّة LTR ستُبقي المصدرَ عند بداية القراءة اللاتينيّة = خطأ.**

### الخلاصة المُعادَة

- **الرندرُ العربيُّ الحاليّ صواب** — سطر المصدر عند نهاية المسار القرائيّ · تقليدٌ صحيح.
- **اللقطةُ المُجدَّدة تُخلّد الصوابَ لا العطبَ** — قبولُ الدرفت لا يخلّد بغيّاً.
- **العطبُ الحقيقيّ في `locale.ts:82`** — `maybeMirror` يعكس `anchor` ولا يمسّ `align`. يستيقظ فقط حين تُضاف هويّة LTR (نظريّاً) أو عربيّةٌ بتوجيه latin (عمليّاً — L-49).

### مُقتَرَحُ إغلاق (٤١١ب-ج · تذكرة منفصلة)

توسيع `maybeMirror` ليعكس `align` أيضاً حين `mirrorOnLTR=true`:
```javascript
// locale.ts:82 المقترح
const anchorMirrored = mirrorAnchorForLTR(spec.anchor, true);
const alignMirrored = spec.align === 'left' ? 'right'
                    : spec.align === 'right' ? 'left'
                    : spec.align;
return { ...spec, anchor: anchorMirrored, align: alignMirrored };
```
اختبارٌ: brand عربيّ + `content.locale=latin` ⇒ يجب أن يظهر المصدر عند اليمين الفيزيائيّ (نهاية القراءة اللاتينيّة).

بعد ٤١١ب-ج، أُعيد تشغيل `bin/mk-ci --regen-refs` — الرندرُ العربيّ لن يتغيّر (RTL يبقى physical-left) · اللقطةُ تنجو. **هذا ما يعني «المرجعُ صواب والكودُ يُصلَح»: تصحيحُ الكود بلا كسر المرجع.**

### وضعُ الشجرة الآن

`snapshots/preview-default.png` و `snapshots/preview-client-demo.png` **رُدَّتا إلى مرجعهما قبل التجديد** (`git checkout` هذه الجلسة) — رفضٌ بنيويٌّ مؤقّت. **`snapshots-semantic/*.png` تبقى مجدّدة** (٣ ملفّات · فخّ النسخ سُدَّ لا رجعة). حالُ الحارس:

```
snapshots/ = 12 · snapshots-semantic/ = 9 متطابقة · 3 مختلفة · 0 مفقودة
  ✓ 3/12 ملفّاً يُثبت أنّ --semantic=on فَعَل شيئاً.
```

`verify:snapshot` داخل Linux سيحمرّ عند التشغيل التالي — **إشارةٌ نظيفة** أنّ ثمّة درفتَ محاذاةٍ معلَّق قرارُه على ٤١١ب-ج. لا يُغلق حتى تُصلَح `locale.ts:82`.

---

## §٩ · L-138 — رسالةُ الالتزام دعوى لا دليل

مُسجَّلٌ في `claude/inbox/README.md` بالعنوان **«رسالةُ الالتزام دعوى لا دليل»**. يحمل رأسه:

> في تحرّي ٤١١ب سمّينا مسبِّبَ الدرفت: `e3ea574` قلَبَ محاذاةَ سطر المصدر. ادّعى نصُّ الالتزام «لم يمسّ لقطة (preview.mjs لا يمرّر assets.images)» — **محدَّدٌ ومعقولٌ وصحيحٌ في نصفه** (طبقة الصورة)، **كاذبٌ في اتّساعه** (طبقة `source` لا تحتاج assets.images). النصفُ الصحيحُ طَمْأنَ كلَّ من قرأه بلا قياس. كلفَنا ثلاثةَ أيّامٍ من العمى.

**قاعدتان:** (١) الادّعاء في رسالة الالتزام لا يعفي من الحارس · يُعاد إنتاجُه في السلسلة نفسِها. (٢) الادّعاءُ المحدَّد ومعقولٌ أخطرُ من العامّ — راحةُ القارئ عندئذٍ تفتح بابَ الدَين الصامت.

**تطبيقٌ في هذه الجلسة:** حارسُ `check-snapshots-not-all-copies` هو الجوابُ الآليّ على كلّ ضمانٍ لفظيّ في التزامٍ يمسّ `snapshots-semantic/`. الجملةُ لا تُثبت نفسَها.

---

## §١٠ · حالةُ التسليم (5 أسطر · للجلسة القادمة)

1. **ما أُنجز · بأيّ hash:** `main = 6c7f28b` (لم يتحرّك · **صفر التزامات · صفر دفع**). في الشجرة العاملة: (أ) `bin/mk-ci --regen-refs` مُنفَّذاً (كسر السطب) · (ب) `scripts/regen-visual-refs.mjs` (جديد · 87 سطراً) · (ج) `scripts/check-snapshots-not-all-copies.mjs` (جديد · موصول في `pnpm test`) · (د) `package.json` (M · وصل الحارس بين `check:template-drift` و `check:migration-timestamp-collision`) · (هـ) `snapshots-semantic/*.png` (3 ملفّات مجدّدة · فخّ النسخ سُدَّ) · (و) `claude/inbox/README.md` (M · L-138 مُضاف) · (ز) هذا التقرير. **`snapshots/*.png` رُدَّت إلى ما قبل التجديد** — رفضٌ بنيويٌّ مؤقّت لدرفت 99G حتّى يُصلَح `locale.ts:82`. حارسُ فخّ النسخ: **3/12 مختلفة · أخضر**. L-46 مُثبَت بأحمر مفتعل (12/12 متطابقة · exit=1) ثمّ أخضر مستعاد (10/12 · exit=0).

2. **الخطوة التالية بالضبط:** ٤١١ب-ج · تذكرةٌ منفصلة: توسيع `maybeMirror` في `packages/engine/src/locale.ts:82` لتشمل `align` (سطران أو ثلاثة). بعدها إعادة `bin/mk-ci --regen-refs` (RTL بلا تغيير · اللقطةُ تنجو). ثمّ الالتزام + الدفع لكلّ ما في الشجرة الآن (٦ ملفّات). خيارٌ ثانٍ: لو أردتَ الالتزامَ قبل ٤١١ب-ج، أعِد التجديد لـ`snapshots/*.png` بـ`cp out/nosemantic/preview-default.png out/nosemantic/preview-client-demo.png ⇒ snapshots/` (يقبل الدرفت الآن · لكن `locale.ts:82` يبقى دَيناً).

3. **الملفّات التي لمستُها هذه الجلسة (كلّها غير مُلتزَمة · `git status`):**
```
 M bin/mk-ci
 M claude/inbox/README.md
 M package.json
 M snapshots-semantic/preview-client-demo.png
 M snapshots-semantic/preview-default-plain.png
 M snapshots-semantic/preview-default.png
?? claude/reports/411b-THE-REFERENCE-ITSELF.md
?? scripts/check-snapshots-not-all-copies.mjs
?? scripts/regen-visual-refs.mjs
```
**لا لمسٌ لطقم `show` أو `shownext` أو أيّ خدمة حيّة · لا لمسٌ لـ`snapshots/*.png` بعد التراجع.**

4. **ما ينقصني منك:** قرارٌ في تذكرة ٤١١ب-ج (إصلاح `locale.ts:82` أوّلاً · ثمّ إعادة تجديد المرجع)، أو إذن بتخطّي التذكرة والالتزام بالحالة الحاليّة (`snapshots-semantic/` مجدّد · `snapshots/` قديم · `locale.ts:82` دَين موثَّق).

5. **حالُ الطقمَين:** لم أُشغّل حاجزَ show/shownext — ٤١١ب داخليٌّ في شجرة main فقط. `mkguard` كما هو.

Opus (mediakit · main) — سياق ~40% · وقفتُ عند حدّك «قِف — الوقت انتهى». جاهزٌ للأوامر القادمة.
