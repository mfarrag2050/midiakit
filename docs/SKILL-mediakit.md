# mediakit — مرجع المشروع

> **المصدر الرسمي للسكيل.** ما يُرفع إلى واجهة Claude يُنسخ من هنا،
> لا يُكتب مباشرة هناك. راجع L-63 · L-64 · تذكرة نظام توليد السكيل.
>
> **منطقتان — لكل واحدة صاحب:**
> - **`GENERATED`** يملكها `scripts/build-skill.mjs`. لا تُحرَّر يدوياً.
> - **`DICTATED`** يملكها المالك عبر Opus. لا يمسّها السكربت.

<!-- BEGIN:GENERATED -->
## مولَّد تلقائياً — لا تحرِّر يدوياً

> **مصدر كل سطر:** ملف أو أمر. يُنتَج بـ`pnpm skill:build`.
> **تاريخ التوليد:** 2026-09-05 · **HEAD:** `a1b65eb` (`main`)

### المراحل — من `PHASES.md §نظرة عامة`

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
| **3.8** | **امتدادات المحرك** (بعد مسح 12) | 3–4 أسابيع | 5 امتدادات نموذجية + تكامل نظيف | ☑ |
| **3.9** | **حراسة المحرك — البوابات الست** (G1..G6) | **أسبوع** | 4/6 مبنيّة · G6 skeleton · G1 و G2 غير مبنيَّين (تصحيح 2026-09-05) | ◐ |
| **3.10** | **content.locale — امتداد محرك متعدّد اللغات** | **يوم** | العربية بالخندق + اللاتينية بلف صحيح؛ برهان بصري ar/en/tr مع اختبار سلبي (bypass applyLocaleToBrand) | ☑ |
| 4 | المنصة (بعد اكتشاف بنود 2026-09-02) | **6–8 أسابيع** | عميل يعمل ذاتياً + سجل مراجعات + سير عمل تحريري + دورة حياة أصول | ☐ |
| 5 | النمو | مستمر | — | ☐ |

### الفروع — من `git for-each-ref`

| الفرع | HEAD | عدد الالتزامات |
|---|---|---|
| `aa-internal` | `ee178ca` | 1 |
| `feat/api` | `712020d` | 90 |
| `feat/studio` | `7b54351` | 89 |
| `main` | `a1b65eb` | 89 |
| `origin/aa-internal` | `ee178ca` | 1 |
| `origin/feat/api` | `712020d` | 90 |
| `origin/feat/studio` | `7b54351` | 89 |
| `origin/main` | `a1b65eb` | 89 |

### الفحوص الآلية — من `package.json` الثلاثة

- **main:** `check:doc-paths` · `check:docker-context` · `check:engine-purity` · `check:lessons-sequence` · `check:no-brand-leak` · `check:skill-fresh` · `verify:multilang` · `verify:perf` · `verify:smart-crop` · `verify:snapshot` · `verify:svg` · `verify:tashkil-collision` · … +2
- **feat/api:** `verify:auth` · `verify:brand-kits`
- **feat/studio:** (لا package.json مقروء عبر git — قد يكون apps/studio غير موجود بعد)

### الدروس — من `docs/LESSONS.md`

- **المدى:** L-1 → L-65
- **العدد الفريد:** 60 · **الإدخالات:** 60
- **فجوات:** L-37 · L-38 · L-39 · L-43 · L-44
- **تكرار:** (لا تكرار)

### قوائم المرحلة 4 — من `docs/17-phase4-plan.md`

- **A-list (25):** `A1` · `A2` · `A3` · `A4` · `A5` · `A6` · `A7` · `A8` · `A9` · `A10` · … +15
- **S-list (22):** `S1` · `S2` · `S3` · `S4` · `S5` · `S6` · `S7` · `S8` · `S9` · `S10` · … +12
- **SYNC (8):** `SYNC-α` · `SYNC-β` · `SYNC-γ` · `SYNC-δ` · `SYNC-ε` · `SYNC-ζ` · `SYNC-η` · `SYNC-θ`

### نقاط النهاية المبنيّة — `git ls-tree origin/feat/api apps/api/src/routes/`

- `apps/api/src/routes/auth/forgot-password.ts`
- `apps/api/src/routes/auth/login.ts`
- `apps/api/src/routes/auth/logout.ts`
- `apps/api/src/routes/auth/refresh.ts`
- `apps/api/src/routes/auth/reset-password.ts`
- `apps/api/src/routes/auth/signup.ts`
- `apps/api/src/routes/brand-kits/assets-version.ts`
- `apps/api/src/routes/brand-kits/create.ts`
- `apps/api/src/routes/brand-kits/delete.ts`
- `apps/api/src/routes/brand-kits/font-ack.ts`
- `apps/api/src/routes/brand-kits/get.ts`
- `apps/api/src/routes/brand-kits/list.ts`
- `apps/api/src/routes/brand-kits/logo-ack.ts`
- `apps/api/src/routes/brand-kits/update.ts`
- `apps/api/src/routes/health.ts`

### محتويات المستودع — من `ls`

- **`packages/`:** `engine` · `shared` · `templates` · `tts`
- **`demo/`:** 15 ملف
- **`snapshots/`:** 12 · **`snapshots-semantic/`:** 12 · **`snapshots-video/`:** 2

<!-- END:GENERATED -->

<!-- BEGIN:DICTATED -->
(بانتظار النصّ المُملى)
<!-- END:DICTATED -->
