# WIRE-7 — تقرير الوصل

**سطر الاستلام:** استلمتُ WIRE-7 · شجرة `/Users/mdervis/MediaKit/pf-mediakit` على `main`.

**عدم تعارض مع IMAGE-FIX:** لم أمسّ `packages/engine/src/render.ts` — تحقّق بـ`git status --short packages/engine/src/render.ts`: فارغ.

**وسم الجُمَل — مفتاح استعمله في التقرير:**
- **👁‍🗨** = رأيتُه في مخرَج · **📄** = قاله سكربت ولم أتحقّق منه بذاته · **❓** = لا أعرف.

---

## ١. تشغيل السبعة كما هي — رموز الخروج الحرفيّة

**👁‍🗨** الجدول التالي من مخرَج `node scripts/<اسم>.mjs` مباشرةً على `main` بعد الدمج، بلا أيّ إصلاح مسبق. الجولة مسجَّلة في `/tmp/wire7-runs/`.

| # | السكربت | exit | العطب الحرفيّ |
|---|---|---:|---|
| 1 | `verify-breaking-video` | **0** | md5 مطابق للمرجع `d59f49e03bef1647d5d5803b6fa58479` — الوحيد الذي يقلع ويمرّ كما هو |
| 2 | `verify-caption-kashida-stability` **(G4)** | **1** | `TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts" for /Users/mdervis/MediaKit/pf-mediakit/packages/shared/src/index.ts` |
| 3 | `verify-audio-gate` | **1** | `[ERR_MODULE_NOT_FOUND] file:///Users/mdervis/MediaKit/pf-mediakit/apps/renderer/src/audio-ffmpeg.js` (نفس علّة `.ts`، مقنَّعة بمحاولة `.js`) |
| 4 | `verify-frame-at` | **1** | نفس علّة `.ts` |
| 5 | `verify-media-track-gate` | **1** | نفس علّة `.ts` |
| 6 | `verify-text-tracks-gate` | **1** | نفس علّة `.ts` |
| 7 | `verify-transitions-gate` | **1** | نفس علّة `.ts` |

**والميّتان (لا ذكر في PHASES.md):**

| السكربت | exit | العطب |
|---|---:|---|
| `verify-boundary-identity` | **1** | نفس علّة `.ts` |
| `verify-wrap-fidelity` | **1** | نفس علّة `.ts` |

**👁‍🗨 خلاصة الجولة الأولى:** واحد فقط يقلع (`verify-breaking-video`). الثمانية الأخرى تفشل جميعاً بـ`ERR_UNKNOWN_FILE_EXTENSION` — استيرادات workspace TS بلا `--import tsx`. حالة صامتة: `pnpm test` لن يعرف بهذا لأنّه لا يستدعيها.

---

## ٢. الجولة الثانية — `node --import tsx <script>` (لتمييز «لا يقلع» عن «يعمل»)

**👁‍🗨** بعد إضافة `--import tsx` للسكربتات السبعة الفاشلة:

| # | السكربت | exit مع `tsx` | الحالة الفعلية |
|---|---|---:|---|
| 1 | `verify-breaking-video` | 0 | يعمل ويمرّ (بلا tsx) |
| 2 | `verify-caption-kashida-stability` (G4) | **0** | يعمل ويمرّ (4 بوابات: أ/ب/ج/د + العكسي) |
| 3 | `verify-audio-gate` | **0** | يعمل ويمرّ (3 بوابات كمّية) |
| 4 | `verify-frame-at` | **0 بعد توليد MP4** | يعمل — **لكنّه ليس بوابة**: يستخرج إطاراً لمقارنة بصريّة يدويّة، لا يُثبت تطابقاً. مذكور في السكربت صراحةً: «بايتات PNG لن تتطابق بايت-بايت لأن ffmpeg يمرّ بترميز H.264 (lossy) ثم فك ترميز → PNG». يعتمد على `out/render-default-breaking.mp4` مولَّداً مسبقاً |
| 5 | `verify-media-track-gate` | **0** | يعمل ويمرّ (3 بوابات كمّية) |
| 6 | `verify-text-tracks-gate` | **0** | يعمل ويمرّ (6 بوابات كمّية) |
| 7 | `verify-transitions-gate` | **0** | يعمل ويمرّ الكمّية · يقول «لم يُعلَن النجاح النهائي بعد (L-17)» — التوكيد البصريّ لكسر الانتقال يبقى بشريّاً |

**التصنيف النهائيّ (المطلوب في §٢ من التذكرة):**

| الحالة | العدد | السكربتات |
|---|---:|---|
| يعمل ويمرّ (بوابة قابلة للوصل) | **6** | verify-breaking-video · verify-caption-kashida-stability · verify-audio-gate · verify-media-track-gate · verify-text-tracks-gate · verify-transitions-gate |
| يعمل لكن ليس بوابة (مساعد بصريّ) | **1** | verify-frame-at |
| لا يقلع | **0** (بعد tsx كلها تقلع) | — |
| ميّت (لا ذكر في PHASES) | **2** | verify-boundary-identity · verify-wrap-fidelity (أُرشفا) |

---

## ٣. الوصل — الستّة داخل `pnpm test`

**👁‍🗨** أُضيف إلى `package.json` ستّة مفاتيح جديدة وأُلحقت بسلسلة `test`:

```
verify:breaking-video               → node scripts/verify-breaking-video.mjs
verify:caption-kashida-stability    → node --import tsx scripts/verify-caption-kashida-stability.mjs
verify:audio-gate                   → node --import tsx scripts/verify-audio-gate.mjs
verify:media-track-gate             → node --import tsx scripts/verify-media-track-gate.mjs
verify:text-tracks-gate             → node --import tsx scripts/verify-text-tracks-gate.mjs
verify:transitions-gate             → node --import tsx scripts/verify-transitions-gate.mjs
```

**verify-frame-at لم يُوصل** — إن وُصل كبوابة فسيمرّ دائماً بلا توكيد على المخرَج، فيُنتج طمأنينة كاذبة (L-71). يُستدعى يدويّاً عند الحاجة.

### الاختبار السلبيّ (L-46 · «أرِه أحمر مرّة»)

**👁‍🗨** قبل الوصل، لكلّ سكربت أُدخلت **حقنة عطب مقصود** بـ`sed` (حفظ `.bak`، شغّل، استعِد)، والمخرَج الأحمر مسجَّل في `/tmp/wire7-canaries/`.

| السكربت | الحقنة | exit | السطر الأحمر المُلتقَط |
|---|---|---:|---|
| `verify-breaking-video` | قلب `===` إلى `!==` في مقارنة md5 | **1** | `✗ اختلاف. المسار الحالي غيّر مخرج breaking.` |
| `verify-caption-kashida-stability` | `tatweelCount > 0` ⇒ `tatweelCount > 999999` | **1** | `✗ الكشيدة مطبَّقة فعلاً (لا فراغ ثابت) — 12 حرف U+0640` · `════════ 1 إخفاق ✗ ════════` |
| `verify-audio-gate` | `audioStreams === 1` ⇒ `audioStreams === 999` | **1** | `عدد المسارات الصوتية في MP4 \| 1 \| 1 \| ✗` · `✗ بوابة كمّية فاشلة.` |
| `verify-media-track-gate` | `framesMedia === framesExpected` ⇒ `framesMedia === 999999` | **1** | `عدد الإطارات \| 192 \| 192 \| ✗` · `✗ بوابة فاشلة — راجع النتائج.` |
| `verify-text-tracks-gate` | `framesTotal === 240` ⇒ `framesTotal === 999999` | **1** | `عدد الإطارات \| 240 \| 240 \| ✗` · `✗ بوابة فاشلة — راجع النتائج.` |
| `verify-transitions-gate` | `framesTotal === 300` ⇒ `framesTotal === 999999` | **1** | `عدد الإطارات \| 300 \| 300 \| ✗` · `✗ بوابة فاشلة (كمّياً) — راجع النتائج.` |

**👁‍🗨 كلّ الستّة أُثبتت حمرتها.** بعد الحقنة أُستعيد كل ملفّ عبر `mv .bak`، وتُحقِّق `git status --short scripts/` = فارغ من `.mjs`. المخرَجات كاملةً محفوظة في `/tmp/wire7-canaries/<name>.out`.

### السلسلة الجديدة بعد الوصل

**👁‍🗨** عدد الأوامر في `pnpm test`:

| | قبل | بعد | Δ |
|---|---:|---:|---:|
| أوامر السلسلة | **19** | **25** | +6 |
| زمن التنفيذ (real) | ~9s | **~59s** | +50s (الستّة الجديدة كلها تفعّل رندر MP4 + ffmpeg) |

**التشغيل النهائيّ (`pnpm test`):** **25/25 خضراء** — كل الستّة الجديدة تمرّ. الفحوص الثلاثة db-dependent (template-sync · plan-sync · control-plane-policies) تعمل بأرقام حقيقيّة (6 قوالب · 5 باقات · 24 جدولاً) لأنّ Docker Postgres مشغَّل.

---

## ٤. الأرشفة — الميّتان

**👁‍🗨** أُنشئ `scripts/archive/` مع `README.md` يوثّق المعيار. نُقل:

```
scripts/verify-boundary-identity.mjs → scripts/archive/verify-boundary-identity.mjs
scripts/verify-wrap-fidelity.mjs     → scripts/archive/verify-wrap-fidelity.mjs
```

**السبب المُسجَّل في `scripts/archive/README.md`:** لا ذكر في `PHASES.md` بأيّ نتيجة كمّية · لا مفتاح في `package.json` · لا استشهاد به من أيّ اختبار. **بلا حذف** — إن احتاج أحد استئناساً تاريخيّاً يجده.

---

## ٥. تصحيح `PHASES.md` — فرق مُلخَّص

**👁‍🗨** ثلاث تصحيحات:

### أ. `PHASES.md:757-761` — جدول 3.7 (نظافة `packages/engine/timeline`)
لكل من الخمسة (`verify-breaking-video` · `verify-media-track-gate` · `verify-text-tracks-gate` · `verify-transitions-gate` · `verify-audio-gate`) أُضيف عمود «وُصل بـ`pnpm verify:<اسم>` — WIRE-7 (2026-09-10)». تحتها كتلة **تصحيح مسجَّل (WIRE-7 · 2026-09-10 · L-71)** تشرح أنّ الخمسة كانت مُعلَنة ✓ بلا وصل منذ 2026-09-02، وأنّ انحدار KICKER-2 مرّ من فوق `verify-breaking-video` لهذا السبب.

### ب. `PHASES.md:1388` — G4 في §المرحلة 3.9
```
قبل:  | G4 | ... | scripts/verify-caption-kashida-stability.mjs | ✓ | ... | 2026-09-03 |
بعد:  | G4 | ... | pnpm verify:caption-kashida-stability (scripts/...) | ✓ · وُصلت WIRE-7 (2026-09-10) | ... | 2026-09-03 · وُصلت 2026-09-10 |
```
وتحت §المرحلة 3.9 أُضيف **تصحيح ثانٍ مسجَّل (2026-09-10 · WIRE-7 · L-71)** يشرح: G4 كانت مُعلَنة ✓ منذ 2026-09-03 والسكربت غير موصول ولا يشتغل — رمز الخروج عند التشغيل الحرفيّ = 1. وُصل اليوم وأُثبتت حمرته.

### ج. `PHASES.md:460` — `verify-frame-at`
```
قبل:  3. ☑ الإطار عند t=1.4 يطابق لقطة ثابتة — scripts/verify-frame-at.mjs.
بعد:  3. ◐ الإطار عند t=1.4 — verify-frame-at.mjs يستخرج إطاراً للمراجعة البصريّة،
      لا يقيس تطابقاً بايت-بايت. [تفصيل التصحيح + المكان + الاستعمال اليدويّ]
```

**BUNDLE.md:** يُعاد توليده تلقائياً عبر `pnpm skill:publish` بعد الالتزام.

---

## ٦. الدرس الجديد — `L-71`

**👁‍🗨** أُضيف قسم `L-71 — سكربت بلا مفتاح ليس بوابة، ولو حمل نتيجة في وثيقة` في `docs/LESSONS.md`. النصّ التنفيذيّ:

> حارس غير موصول أسوأ من غياب حارس. غياب الحارس يُنتج قلقاً صحيّاً يدفع للحرص. الحارس غير الموصول يُنتج **طمأنينة كاذبة** — الوثيقة تحمل «✓» ورقماً، ولا شيء يفشل عند الانحدار. القياس اليدويّ لحظةً ليس حارساً مستمرّاً.

**الشاهد التاريخيّ المذكور:** G4 (verify-caption-kashida-stability) — مُعلَنة ✓ منذ 2026-09-03، مصدر L-46، مذكورة أربع مرّات في BUNDLE، ولا تعمل. `verify-breaking-video` كان سيكشف انحدار KICKER-2 لحظة وقوعه لو كان موصولاً.

**القواعد التنفيذيّة:**
1. كل `verify-*.mjs` مُعلَن بوابةً في PHASES يجب أن يحمل مفتاحاً في `package.json` **وأن يدخل `pnpm test`**.
2. قبل إعلان أيّ سكربت جديد بوابةً: **أرِه أحمر مرّة** بحقنة عطب مقصود، ثم استعِد، ثم الصق المخرَج (L-46 موسَّع).
3. السكربت بلا ذكر في PHASES ولا مالك → `scripts/archive/` بلا حذف.
4. البوابة التي تعمل بـ`--import tsx` حصراً → مفتاحها في `package.json` يحمل `--import tsx` صراحةً.

**تحديث سطر الملخّص:** أُضيف `L-71` إلى قائمة الترقيم في السطر 2360.

**تحقّق آليّ:** `check:lessons-sequence` = `دروس مكتشفة: 66 إدخال · المدى: L-1 → L-71 · ✓ لا تكرار`. الفجوات القديمة (L-37/38/39/43/44) تحذير موروث لا فشل.

---

## ٧. رؤوس الفروع وحكم الرفع

**👁‍🗨** حالة قبل الالتزام (بعد كل التعديلات):

```
$ git branch --show-current
main

$ git log --oneline -1
6601f19 docs: skill:publish بعد TASHKIL-OFF   (قبل WIRE-7)

$ git status --short
 M PHASES.md
 M docs/LESSONS.md
 M package.json
 R  scripts/verify-boundary-identity.mjs -> scripts/archive/verify-boundary-identity.mjs
 R  scripts/verify-wrap-fidelity.mjs -> scripts/archive/verify-wrap-fidelity.mjs
?? scripts/archive/README.md
?? claude/reports/WIRE-7.md
```

**سيُلتزَم في commit(ين):**
1. WIRE-7 الرئيسي: package.json + PHASES + LESSONS + scripts/archive/ + هذا التقرير
2. skill:publish: docs/SKILL-mediakit.md + docs/BUNDLE.md المُعاد توليدهما

**حكم الرفع:** يُدفع في نهاية التذكرة إلى `origin/main`.

---

## ٨. ملاحظات مسجَّلة

- **📄 L-17 للانتقالات والصوت:** `verify-transitions-gate` و `verify-audio-gate` يقولان في مخرَجهما: «البوابات الكمّية اجتازت — لم يُعلَن النجاح النهائي بعد (L-17)». أي: التوكيد البصريّ (لا وميض عند نقطة الانتقال، لا فقاعة صوتية في التلاشي) يبقى بشريّاً. **الوصل يحرس الكمّية.** الجودة البصريّة تبقى مسؤولية المالك.
- **❓ verify-frame-at كان في PHASES مُعلَناً كبوابة (☑)** — لا أعرف من أعلنه ولا متى تحوّل من بوابة إلى مساعد. حاليّاً هو مساعد بلا شكّ (السكربت يعترف).
- **👁‍🗨 verify-audio-gate ينتاول ما وصف أنّه «رخيص»:** يشغّل `renderVideo` + `ffprobe` + `showwavespic` لكل تنفيذ. أضاف ~10s للسلسلة. مقبول ضمن الميزانية الحاليّة (59s كامل).
