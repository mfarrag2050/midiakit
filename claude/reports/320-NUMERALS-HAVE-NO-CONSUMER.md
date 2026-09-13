# 320-NUMERALS · اعتراف صريح + قياس فرقيّ + اختبار على layout

**استلمتُ.** الالتزام `db2e93b`.

---

## §١ · اعتراف صريح — العطب في سكربتي لا في المحرّك

**فحص المستهلكات (رأيتُه في مخرَج · `grep`):**
```
packages/engine/src/render.ts:584 → brand.typography.bidi.numerals
packages/engine/src/text/bidi.ts:187 → mapNumerals عبر preprocessBidi
packages/engine/src/layers/attribution.ts:466 → mapNumerals
```

**المحرّك يحوّل الأرقام بالفعل.** أثبتُّ ذلك بالتشغيل المباشر:
```
raw:       منصّة Nimbus ... 25% ...
processed: منصّة Nimbus ... ٢٥% ...  ← عربيّ
```

**العطب كان في `scripts/300-emit-layout.mjs`** الذي كتبتُه في 310 — **لم يستدعِ `preprocessBidi`**، فعرض «25%» في layout.json بينما المحرّك يرسم «٢٥%» في PNG.

اتّهمتُ المحرّك بناءً على **أداة قياس ناقصة**. هذا درس بذاته: أدوات التشخيص نفسها تحتاج أن تعكس مسار الإنتاج بدقّة · وإلا كشفتْ عطباً وهميّاً وأخفَت الحقيقيّ.

**§٣ · الإصلاح:** إضافة `preprocessBidi` قبل `parseTokens` في السكربت. إعادة توليد 12 `.layout.json` — كلّها الآن `«٢٥%»` (رأيتُه في مخرَج).

---

## §٢ · جدول BrandKit (أوّليّ · scripts/320-brand-kit-consumers.mjs)

**النتيجة الأوّليّة:** 48 حقلاً مُستهلَك · 58 حقلاً غير مستهلَك ظاهريّاً.

**اعتراف صريح ثانٍ:** الفحص الآليّ (grep) **يفوّت references destructured/renamed**. مثال:
- `resolveBrand(brand).colors.text` — يمرّ لأنّ `.colors.text` نصّ.
- `const { colors } = brand; colors.text` — قد يُفوَّت.
- `resolveRef('colors.text')` كسلسلة تُحلّ في runtime — عبر string literal.

**الجدول أوّليّ** — يحتاج مسحاً يدويّاً للحقول «غير المستهلَكة» قبل الحكم النهائيّ. **تذكرة توسّع خارج نطاق 320.**

**ما هو مؤكَّد كعلامات بلا مستهلك (بحسب الفحص الأوّليّ):**
- `version` — للـmetadata فقط
- `fonts.primary.licenseAck` — إقرار قانونيّ · يُتحقّق مرّة عند upload لا في الرسم
- `fonts.capabilities.variableAxes` — بنية جاهزة لخطوط متغيّرة لم تُدعَم بعد
- `logo.watermark.opacity/scale/offsetX` — العلامة المائيّة مطفَأة افتراضاً
- `motion.*` (10 حقول) — للـtimeline (يحتاج فحص أعمق داخل timeline/)
- `typography.headline.max/min/boxWidth` — نُسِخت من الأصل · قالب breaking يستعمل `typography.breaking.*` منفصلاً

**السكربت:** `scripts/320-brand-kit-consumers.mjs` — منتج للـinventory · مبنيّ للتحسين.

---

## §٤ · قياس التشكيل الفرقيّ (حكم owner: ج · لا opentype.js)

**التنفيذ في `scripts/300-emit-layout.mjs::measureDiacriticInkDelta`:**
```
DIACRITIC_RE = /[ً-ٰٟۖ-ۭ]/g;   // Unicode combining marks
stripDiacritics(text) = text.replace(DIACRITIC_RE, '');

٬ رسم النصّ مشكولاً وبلا تشكيل على canvas مؤقّت
٬ topInkY = أعلى y فيه alpha > 32
٬ delta = withoutMarks.topY - withMarks.topY
```

**الحقل الجديد في layout.json:**
```json
"diacritics": {
  "method": "differential-ink-box",
  "status": "ok-marks-visible" | "zero-delta-marks-may-be-lost" | "ink-touches-canvas-top-suspect-clipping",
  "measurements": [{ "word", "fs", "withMarks", "withoutMarks", "delta", "inkClipped" }]
}
```

**اكتشاف حقيقيّ على ع3-diacritics-short (رأيتُه في مخرَج):**

| كلمة | fs | delta | inkClipped | تفسير |
|---|---:|---:|:---:|---|
| قَرارٌ | 49 | **11 px** | ✗ | التنوين ظاهر · مساحة واضحة |
| مُفاجِئ | 49 | **0 px** | ✗ | الهمزة/الضمّة **لا ترفعان الحبر** |
| بتَعليقِ | 49 | 1 px | ✗ | الفتحة/الكسرة بالكاد |
| الرِّحلات | 49 | **0 px** | ✗ | الشدّة على الرّاء **لا ترفع الحبر** |

**status: `zero-delta-marks-may-be-lost`** — الأداة كشفت أنّ التشكيل في «مُفاجِئ» و «الرِّحلات» لا يُنتج حبراً إضافيّاً. الاحتمالات:
1. IBM Plex Sans Arabic يرسم الشدّة/الضمّة **داخل** صندوق الحرف (لا فوقه)
2. التشكيل غير مرسوم فعلاً (bug في skia-canvas render)
3. مقصوصة داخل صندوق الحرف

**بلا opentype.js · هذا القياس يجيب السؤال: «هل يُقصّ التشكيل؟»** — نعم، جزئيّاً، على «مُفاجِئ» و«الرِّحلات».

**لم أكتب `'unmeasured'` بعد اليوم** كما أمرت.

---

## §٥ · الاختبار (§٤ · يقرأ layout.json لا الصورة)

**`scripts/verify-layout-assertions.mjs`** — 11 تأكيد على 12 ملفّ (رأيتُه في مخرَج):

| # | التأكيد | نتيجة |
|---|---|---|
| ١ | ع2 processed يحوي «٢٥» لا «25» (٤ مقاسات) | ✓ ✓ ✓ ✓ |
| ٢ | 0 orphan-prep في نهاية أيّ سطر (12 ملفّ · بعد إصلاح 107) | ✓ |
| ٣ | ع2 · Nimbus dir='ltr' xEnd=820 (٣ مقاسات) | ✓ ✓ ✓ |
| ٤ | ع1 · «المواد» و «الغذائيّة» لم يُفصلا (٣ مقاسات) | ✓ ✓ ✓ |

**L-46 (رأيتُه في مخرَج):**
- **أخضر:** 11/11 تأكيد
- **أحمر (حقن):** غيّرتُ `break.after='في'` في نسخة → `✗ 1 فشل باسم الملفّ والسطر والكلمة`
- **إعادة الأصل:** أخضر ثانية

---

## §٦ · الحالة الفنيّة

- **HEAD:** `db2e93b` (feat(demo): 320)
- **origin/main:** `c4c0c89`
- **غير مدفوع:** 11 التزاماً
- **mk-ci:** يعمل الآن على `db2e93b`
- **الملفّات الجديدة:**
  - `scripts/300-emit-layout.mjs` (محدَّث · قياس فرقيّ)
  - `scripts/320-brand-kit-consumers.mjs` (جدول أوّليّ)
  - `scripts/verify-layout-assertions.mjs` (اختبار § ٤)
  - `demo/marafi/*.layout.json` (12 ملفّ · محدَّث)

---

## §٧ · درس ضمنيّ (يستحقّ L)

**أدوات القياس نفسها تحتاج L-46.** كشفتُ عطباً وهميّاً في المحرّك بسبب سكربت تشخيص ناقص. **قياسٌ يخفي الحقيقة أخطر من قياسٍ يذكر الحقيقة الجزئيّة صراحةً** — لأنّه يمنح ثقة كاذبة.

**اقتراح L (خارج نطاق 320):** «أدوات القياس تعكس مسار الإنتاج حرفيّاً · وإلا كشفت وهماً وأخفَت حقيقة. اختبرها بمثال معروف قبل الاعتماد على مخرَجها».

---

**التقرير:** `/Users/mdervis/MediaKit/pf-mediakit/claude/reports/320-NUMERALS.md`

---

## §٩ · تصحيح جوهريّ (بعد 330 · L-78)

**كتبتُ في §٤:** «status='zero-delta-marks-may-be-lost' — الأداة كشفت أنّ التشكيل في «مُفاجِئ» و«الرِّحلات» لا يُنتج حبراً إضافيّاً» — واستنتجتُ ضمنيّاً «قد يُقصّ التشكيل».

**owner صحّح في 330:** deltaTop=0 يتّسق مع **٣ احتمالات** بلا تمييز:
1. العلامة داخل صندوق الحرف (سليم)
2. العلامة غير مرسومة (عطب جسيم)
3. العلامة مقصوصة

قياس أعلى الحبر وحده لا يفرّق بينها. الحكم الصحيح لم يكن «قد يُقصّ» بل **«غير محسوم بين ٣»**.

**330 §٣** أدخل القياس المحسوم (diffCount + inkWith/Without). النتيجة على نفس الحالات:

| كلمة | diffCount | deltaTop | status (330) |
|---|---:|---:|---|
| قَرارٌ | 161 | 11 | **marks-above-box** ✓ |
| مُفاجِئ | 133 | 0 | **marks-inside-box** ✓ (سليم — داخل الصندوق) |
| بتَعليقِ | 87 | 1 | **marks-above-box** ✓ |
| الرِّحلات | 130 | 0 | **marks-inside-box** ✓ (سليم) |

**الحقيقة:** كلّ التشكيلات **مرسومة فعلاً** (diffCount > 0). IBM Plex Sans Arabic يرسم الشدّة/الضمّة/الفتحة **داخل صندوق الحرف** لا فوقه — هذا سليم. لم يُقصَّ شيء.

**حكمي في §٤ كان خاطئاً** بناءً على قياس ناقص. راجع تقرير 330-INK-DIFF-NOT-INK-TOP.md للتفصيل.
