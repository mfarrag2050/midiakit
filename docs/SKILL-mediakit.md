---
name: mediakit
description: |
  مرجع مشروع «Media Kit» عبر الجلسات — تحويل أداة الإنتاج البصري
  العربية (بطاقات، عاجل، ريلز) من إضافة Photopea داخلية بُنيت
  لوكالة الأناضول إلى منتج SaaS متعدد الهويات لوكالات السوشيال
  ميديا العربية. يحمل القواعد التسع، القيم المستخرجة من الكود
  الأصلي، الخندق التنافسي (الكشيدة، الكسر الدلالي، التشكيل،
  BiDi)، معمارية المنصة وقراراتها، الدَين المفتوح، وقواعد
  المراجعة. استخدمها كلما لمس العمل هذا المشروع — المحرك،
  brandKit، القوالب، الرندر، الطوابير، mk-api، mk-studio،
  التسعير، العميل الأول — أو حين يسأل «أين توقفنا». مشغّلات:
  Media Kit، ميديا كيت، brandKit، الكشيدة، التطويل، drawAt،
  بطاقة العاجل، الريلز، الخط الزمني، SYNC-α. لا تستخدمها لـ
  aqop-portal أو aql-* أو aa-* أو topia أو primemind أو minhaj.
---
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
> **تاريخ التوليد:** 2026-09-12 · **HEAD:** `fa67467` (`main`)
>
> **قراءة النطاق:** كل عنوان قسم يحمل نطاقه — «من main» يخصّ حالة
> الفرع الرئيسي فقط · «عبر الفروع» يجمع main + feat/api + feat/studio.
> السطر «packages: engine · shared · templates · tts» صحيح لـmain
> ولا يصف المشروع كله — packages/ui و packages/i18n موجودتان على
> feat/studio (تصحيح 2026-09-06).

### المراحل — من main (`PHASES.md §نظرة عامة`)

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
| 4 | المنصة (بعد اكتشاف بنود 2026-09-02) | **6–8 أسابيع** | عميل يعمل ذاتياً + سجل مراجعات + سير عمل تحريري + دورة حياة أصول | ◐ جارية — الحالة التفصيلية في `PHASES-api.md` (feat/api) و `PHASES-studio.md` (feat/studio). `main` لا يتتبّع تقدّم المسارين. |
| 5 | النمو | مستمر | — | ☐ |

### الفروع — عبر الفروع (`git for-each-ref` · مقارَنة بـ`origin/main`)

| الفرع | HEAD | أمام main | خلف main | الإجمالي |
|---|---|---:|---:|---:|
| `aa-internal` | `ee178ca` | 0 | 191 | 1 |
| `feat/api` | `2010046` | 11 | 8 | 195 |
| `feat/ci` | `8901ed8` | 22 | 3 | 211 |
| `feat/dashboards` | `376077c` | 0 | 80 | 112 |
| `feat/studio` | `fe0f71e` | 43 | 10 | 225 |
| `origin/aa-internal` | `ee178ca` | 0 | 191 | 1 |
| `origin/feat/api` | `2010046` | 11 | 8 | 195 |
| `origin/feat/ci` | `8901ed8` | 22 | 3 | 211 |
| `origin/feat/dashboards` | `376077c` | 0 | 80 | 112 |
| `origin/feat/studio` | `fe0f71e` | 43 | 10 | 225 |

### الفحوص الآلية — عبر الفروع (`package.json` الجذر)

- **main (72):** `check:brand-editor-labels` · `check:brand-editor-labels:self-test` · `check:brand-kit-patch-coverage` · `check:control-plane-policies` · `check:dashboard-not-published` · `check:digit-style-isolation` · `check:doc-paths` · `check:docker-context` · `check:docs-bundle-fresh` · `check:engine-purity` · `check:error-code-coverage` · `check:lessons-sequence` · `check:locale-parity` · `check:logical-props` · `check:no-ai-provider-outside-ai` · `check:no-brand-leak` · `check:no-brand-url-fetch` · `check:no-git-internals` · `check:no-paddle-outside-payments` · `check:observe-import-scope` · `check:plan-sync` · `check:response-envelope` · `check:script-paths` · `check:skill-fresh` · `check:template-sync` · `check:ui-enum-leaks` · `check:ui-enum-leaks:self-test` · `check:ui-keys` · `verify:a18-5` · `verify:a18-6` · `verify:a21` · `verify:a22` · `verify:a23` · `verify:a24` · `verify:a25` · `verify:a28` · `verify:alerts-wire` · `verify:all` · `verify:assets` · `verify:audio-gate` · `verify:auth` · `verify:bk-numerals` · `verify:brand-kits` · `verify:breaking-video` · `verify:caption-kashida-stability` · `verify:control-plane` · `verify:debt1` · `verify:image-fixture` · `verify:image-layer` · `verify:limits1` · `verify:media-track-gate` · `verify:multilang` · `verify:perf` · `verify:plan-all-templates` · `verify:plan-values` · `verify:plans` · `verify:projects` · `verify:render-video-all-templates` · `verify:renders` · `verify:revisions` · `verify:smart-crop` · `verify:snapshot` · `verify:svg` · `verify:tashkil-collision` · `verify:templates` · `verify:tenant` · `verify:tenant-isolation` · `verify:text-tracks-gate` · `verify:transitions-gate` · `verify:tts` · `verify:users` · `verify:workflows`
- **feat/api (63):** `check:brand-kit-patch-coverage` · `check:ci-no-env-file` · `check:control-plane-policies` · `check:dashboard-not-published` · `check:doc-paths` · `check:docker-context` · `check:docs-bundle-fresh` · `check:engine-purity` · `check:isolation-completeness` · `check:lessons-sequence` · `check:no-ai-provider-outside-ai` · `check:no-brand-leak` · `check:no-brand-url-fetch` · `check:no-git-internals` · `check:no-paddle-outside-payments` · `check:observe-import-scope` · `check:plan-sync` · `check:response-envelope` · `check:script-paths` · `check:skill-fresh` · `check:template-sync` · `verify:a18-5` · `verify:a18-6` · `verify:a21` · `verify:a22` · `verify:a23` · `verify:a24` · `verify:a25` · `verify:a28` · `verify:alerts-wire` · `verify:all` · `verify:assets` · `verify:audio-gate` · `verify:auth` · `verify:bk-numerals` · `verify:brand-kits` · `verify:breaking-video` · `verify:caption-kashida-stability` · `verify:control-plane` · `verify:debt1` · `verify:image-layer` · `verify:limits1` · `verify:media-track-gate` · `verify:multilang` · `verify:perf` · `verify:plan-all-templates` · `verify:plans` · `verify:projects` · `verify:render-video-all-templates` · `verify:renders` · `verify:revisions` · `verify:smart-crop` · `verify:snapshot` · `verify:svg` · `verify:tashkil-collision` · `verify:templates` · `verify:tenant` · `verify:tenant-isolation` · `verify:text-tracks-gate` · `verify:transitions-gate` · `verify:tts` · `verify:users` · `verify:workflows`
- **feat/studio (70):** `check:brand-editor-labels` · `check:brand-editor-labels:self-test` · `check:brand-kit-patch-coverage` · `check:control-plane-policies` · `check:dashboard-not-published` · `check:digit-style-isolation` · `check:doc-paths` · `check:docker-context` · `check:docs-bundle-fresh` · `check:engine-purity` · `check:error-code-coverage` · `check:lessons-sequence` · `check:locale-parity` · `check:logical-props` · `check:no-ai-provider-outside-ai` · `check:no-brand-leak` · `check:no-brand-url-fetch` · `check:no-git-internals` · `check:no-paddle-outside-payments` · `check:observe-import-scope` · `check:plan-sync` · `check:response-envelope` · `check:script-paths` · `check:skill-fresh` · `check:template-sync` · `check:ui-enum-leaks` · `check:ui-enum-leaks:self-test` · `check:ui-keys` · `verify:a18-5` · `verify:a18-6` · `verify:a21` · `verify:a22` · `verify:a23` · `verify:a24` · `verify:a25` · `verify:a28` · `verify:alerts-wire` · `verify:all` · `verify:assets` · `verify:audio-gate` · `verify:auth` · `verify:bk-numerals` · `verify:brand-kits` · `verify:breaking-video` · `verify:caption-kashida-stability` · `verify:control-plane` · `verify:debt1` · `verify:image-layer` · `verify:limits1` · `verify:media-track-gate` · `verify:multilang` · `verify:perf` · `verify:plan-all-templates` · `verify:plans` · `verify:projects` · `verify:render-video-all-templates` · `verify:renders` · `verify:revisions` · `verify:smart-crop` · `verify:snapshot` · `verify:svg` · `verify:tashkil-collision` · `verify:templates` · `verify:tenant` · `verify:tenant-isolation` · `verify:text-tracks-gate` · `verify:transitions-gate` · `verify:tts` · `verify:users` · `verify:workflows`

### حالة المرحلة 4 — عبر الفروع (`PHASES-api.md` · `PHASES-studio.md`)

- **mk-api (feat/api):** آخر مبنيّ ✅ = `A28` · نقاط التزامن المفتوحة: `SYNC-α · فُتحت 2026-09-05 · المسار المُسلِّم: mk-api` · `SYNC-β · فُتحت 2026-09-06 · المسار المُسلِّم: mk-api` · `SYNC-γ · فُتحت 2026-09-06 · المسار المُسلِّم: mk-api` · `SYNC-δ · فُتحت 2026-09-06 · المسار المُسلِّم: mk-api` · `SYNC-ε · فُتحت 2026-09-07 · المسار المُسلِّم: mk-api` · `SYNC-ζ · فُتحت 2026-09-07 · المسار المُسلِّم: mk-api` · `SYNC-η · فُتحت 2026-09-07 · المسار المُسلِّم: mk-api` · `SYNC-θ · فُتحت 2026-09-07 · المسار المُسلِّم: mk-api`
- **mk-studio (feat/studio):** آخر مبنيّ ✅ = `S23` · جارٍ 🟡: `S6 · S7 — ربط حقيقي + تخطيط رئيسي` · `S8 — منتقي الأصول`

### الدروس — من main (`docs/LESSONS.md`)

- **المدى:** L-1 → L-77
- **العدد الفريد:** 72 · **الإدخالات:** 72
- **فجوات:** L-37 · L-38 · L-39 · L-43 · L-44
- **تكرار:** (لا تكرار)

### قوائم المرحلة 4 — من main (`docs/17-phase4-plan.md`)

- **A-list (30):** `A1` · `A2` · `A3` · `A4` · `A5` · `A6` · `A7` · `A8` · `A9` · `A10` · `A11` · `A12` · `A13` · `A14` · `A15` · `A16` · `A17` · `A18` · `A19` · `A20` · `A21` · `A22` · `A23` · `A24` · `A25` · `A26` · `A27` · `A28` · `A18.5` · `A18.6`
- **S-list (33):** `S1` · `S2` · `S3` · `S4` · `S5` · `S6` · `S7` · `S8` · `S9` · `S10` · `S11` · `S12` · `S13` · `S14` · `S15` · `S16` · `S17` · `S18` · `S19` · `S20` · `S21` · `S22` · `S23` · `S24` · `S25` · `S26` · `S27` · `S28` · `S29` · `S30` · `S31` · `S32` · `S33`
- **SYNC (8):** `SYNC-γ` · `SYNC-α` · `SYNC-β` · `SYNC-δ` · `SYNC-ε` · `SYNC-ζ` · `SYNC-η` · `SYNC-θ`

### نقاط النهاية المبنيّة — عبر الفروع (`git ls-tree origin/feat/api apps/api/src/routes/`)

- `apps/api/src/routes/ai/create.ts`
- `apps/api/src/routes/ai/delete.ts`
- `apps/api/src/routes/ai/invoke.ts`
- `apps/api/src/routes/ai/list.ts`
- `apps/api/src/routes/assets/delete.ts`
- `apps/api/src/routes/assets/detect-faces.ts`
- `apps/api/src/routes/assets/finalize.ts`
- `apps/api/src/routes/assets/get.ts`
- `apps/api/src/routes/assets/list.ts`
- `apps/api/src/routes/assets/patch-faces.ts`
- `apps/api/src/routes/assets/refresh-url.ts`
- `apps/api/src/routes/assets/shared/kind-rules.ts`
- `apps/api/src/routes/assets/shared/mapper.ts`
- `apps/api/src/routes/assets/upload-url.ts`
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
- `apps/api/src/routes/brand-kits/patch-content-type.test.ts`
- `apps/api/src/routes/brand-kits/update.ts`
- `apps/api/src/routes/health.ts`
- `apps/api/src/routes/platform/auth/login.ts`
- `apps/api/src/routes/platform/auth/logout.ts`
- `apps/api/src/routes/platform/auth/refresh.ts`
- `apps/api/src/routes/platform/ops/queues.ts`
- `apps/api/src/routes/platform/ops/subscriptions.ts`
- `apps/api/src/routes/platform/ops/usage.ts`
- `apps/api/src/routes/platform/plans/create.ts`
- `apps/api/src/routes/platform/plans/delete.ts`
- `apps/api/src/routes/platform/plans/get.ts`
- `apps/api/src/routes/platform/plans/list.ts`
- `apps/api/src/routes/platform/plans/revisions.ts`
- `apps/api/src/routes/platform/plans/shared.ts`
- `apps/api/src/routes/platform/plans/update.ts`
- `apps/api/src/routes/platform/shared/role-guard.ts`
- `apps/api/src/routes/platform/tenants/get.ts`
- `apps/api/src/routes/platform/tenants/list.ts`
- `apps/api/src/routes/platform/tenants/update.ts`
- `apps/api/src/routes/platform/users/create.ts`
- `apps/api/src/routes/platform/users/delete.ts`
- `apps/api/src/routes/platform/users/get.ts`
- `apps/api/src/routes/platform/users/list.ts`
- `apps/api/src/routes/platform/users/update.ts`
- `apps/api/src/routes/projects/annotations/create.ts`
- `apps/api/src/routes/projects/annotations/delete.ts`
- `apps/api/src/routes/projects/annotations/list.ts`
- `apps/api/src/routes/projects/annotations/update.ts`
- `apps/api/src/routes/projects/assign.ts`
- `apps/api/src/routes/projects/create.ts`
- `apps/api/src/routes/projects/delete.ts`
- `apps/api/src/routes/projects/get.ts`
- `apps/api/src/routes/projects/list.ts`
- `apps/api/src/routes/projects/shared/mapper.ts`
- `apps/api/src/routes/projects/state.ts`
- `apps/api/src/routes/projects/transitions.ts`
- `apps/api/src/routes/projects/update.ts`
- `apps/api/src/routes/renders/brand-snapshot.ts`
- `apps/api/src/routes/renders/cancel.ts`
- `apps/api/src/routes/renders/create.ts`
- `apps/api/src/routes/renders/delete.ts`
- `apps/api/src/routes/renders/get.ts`
- `apps/api/src/routes/renders/list.ts`
- `apps/api/src/routes/renders/output.ts`
- `apps/api/src/routes/renders/shared/mapper.ts`
- `apps/api/src/routes/renders/template-snapshot.ts`
- `apps/api/src/routes/revisions/factory.ts`
- `apps/api/src/routes/subscription/cancel.ts`
- `apps/api/src/routes/subscription/checkout.ts`
- `apps/api/src/routes/subscription/get.ts`
- `apps/api/src/routes/subscription/invoices.ts`
- `apps/api/src/routes/subscription/resume.ts`
- `apps/api/src/routes/templates/create.ts`
- `apps/api/src/routes/templates/delete.ts`
- `apps/api/src/routes/templates/get.ts`
- `apps/api/src/routes/templates/list.ts`
- `apps/api/src/routes/templates/shared/mapper.ts`
- `apps/api/src/routes/templates/update.ts`
- `apps/api/src/routes/tenant/get.ts`
- `apps/api/src/routes/tenant/patch.ts`
- `apps/api/src/routes/usage/current.ts`
- `apps/api/src/routes/usage/history.ts`
- `apps/api/src/routes/users/accept-invite.ts`
- `apps/api/src/routes/users/delete.ts`
- `apps/api/src/routes/users/get.ts`
- `apps/api/src/routes/users/invite.ts`
- `apps/api/src/routes/users/list.ts`
- `apps/api/src/routes/users/update.ts`
- `apps/api/src/routes/webhooks/subscription.ts`
- `apps/api/src/routes/workflows/create.ts`
- `apps/api/src/routes/workflows/delete.ts`
- `apps/api/src/routes/workflows/get.ts`
- `apps/api/src/routes/workflows/list.ts`
- `apps/api/src/routes/workflows/shared/mapper.ts`
- `apps/api/src/routes/workflows/shared/schema.ts`
- `apps/api/src/routes/workflows/update.ts`

### محتويات المستودع — من main (`ls`)

- **`packages/`:** `db` · `engine` · `i18n` · `shared` · `templates` · `tts` · `ui`
- **`demo/`:** 17 ملف
- **`snapshots/`:** 12 · **`snapshots-semantic/`:** 12 · **`snapshots-video/`:** 2

<!-- END:GENERATED -->

<!-- BEGIN:DICTATED -->
## ما هو

تحويل أداة `AA Media Kit` — ملف HTML واحد يعمل إضافةً داخل
Photopea، بُني لوكالة الأناضول — إلى منتج SaaS يُباع لوكالات
السوشيال ميديا العربية.

**النموذج:** العميل يدخل فيجد هويته — خطه وألوانه وشعاره
وقوالبه — فيكتب العنوان ويصدّر بطاقة أو فيديو جاهزاً للنشر.

**الأصل التجاري:** محرك الطباعة العربية.
**التموضع:** «المكان الوحيد الذي تُطبَع فيه العربية بشكل صحيح
على الويب.»

## القواعد التسع — لا تُخالَف

1. **المحرك خالص.** لا `document` ولا `window` ولا
   `localStorage`. يستقبل `(template, brand, content, size)`
   ويعيد Canvas.
2. **Canvas 2D يبقى** — منطق اللف العربي غير قابل للتعبير عنه
   في CSS.
3. **صفر قيم مثبتة للهوية.** أي لون أو خط أو هامش داخل دالة
   رسم = خطأ.
4. **القوالب بيانات لا كود.**
5. **`drawAt(ctx, W, H, T)` مقدّسة** — دالة خالصة من الزمن إلى
   إطار.
6. **لا خطوط تجارية في المستودع.**
7. **لا أصول أناضول في النسخة التجارية.**
8. **البطاقة قبل الفيديو** — الاستخدام صور لا فيديو بفارق
   10–100 ضعف.
9. **الخط الزمني مكوّن أساسي** — محرّكه مبنيّ، وواجهته لم تُبنَ.

**أسلوب العمل:** الخنق التدريجي لا إعادة الكتابة.

## خريطة الوثائق — أيّ ملف يحكم ماذا

**لا تخطّط من ملف واحد.** افتح ما يحكم موضوعك من `docs/BUNDLE.md`:

| الملف | يحكم |
|---|---|
| `09-launch-spec` | **معايير الجاهزية** — قائمة «جاهز للبيع» 11 بنداً · «القبول قبل التسليم» 6 خانات · استمارة الإعداد · تدفّق التشكيل |
| `12-feature-scan` | **نطاق الإصدار الأول** — 11 بنداً · وما أُسند للمرحلة 4 |
| `11-parallel-work` | التوازي · ملكية الملفات · الملفات المقفلة · المنافذ |
| `08-operations` | التشغيل · الطوابير · **الحدود الإلزامية** · لوحة التشغيل · SLA |
| `03-brand-kit-spec` | **كل قيمة رقمية** — ألوان · هوامش · أحجام · نسب |
| `04-template-spec` | القوالب · `content` · `content.locale` · قاعدة الأولوية |
| `05-engine-api` | عقد المحرك |
| `10-timeline-editor` | الخط الزمني — النموذج والمراحل أ..ز |
| `16-api-contract` | عقد الـAPI — الأشكال والأخطاء والغلاف |
| `17-phase4-plan` | خطة المرحلة 4 — **مشتقّة من 09 و 12 و PHASES، لا بديلة عنها** |
| `PHASES.md` | الحالة الفعلية · القرارات بتواريخها · البنود المنقولة |
| `LESSONS.md` | الدروس كاملة — السكيل يحمل عناوينها لا نصوصها |

**والسكيل ملخّص لا بديل.** قراءته ليست قراءة الملف.

## الخندق

Canva أقرّت بعدم دعمها الكامل للعربية · Affinity بلا RTL أصلي ·
خلل Premiere بلا حلّ منذ سبع سنوات.

1. **التبرير بالكشيدة** — لا متصفح يدعمه. لافتة المنتج.
2. **كسر السطور الدلالي** — لا يُقسم «مجلس الأمن الدولي».
3. **التشكيل الآلي** — النموذج اقتراح لا سلطة؛ العميل يملك
   القرار بالحرف (`docs/09`).
4. **BiDi.**

## قواعد المراجعة

- **الشجرة لا تُرى من هنا.** كل جملة تحمل واحداً من ثلاثة:
  رأيتُه في مخرَج · قاله تقرير ولم أتحقّق · **لا أعرف**.
- **لا ترجيح لقرار معماري قبل أرقامه.**
- **السؤال للمالك محصور فيما لا يملك جوابه غيره.** «ما الموجود؟»
  للتحرّي.
- **جرد الحالة المشتركة من `main` وحدها.**
- **لا اقتطاع في القوائم.**
- **الخطة تفتتح بنفي التنفيذ · تقرير الإنجاز بـ`git log`.**
- **التذاكر في كتلة كود واحدة**، والتحليل نصّاً عادياً.
- **المرجع في التقارير:** آخر التزام للجلسة نفسها.
- **البوابة تُعلَن بعدد إخفاقاتها لا بحالتها.** «خضراء» ليست
  دليلاً — `verify:brand-kits` أُعلن «إخفاق واحد» أربع مرات
  وكانت 30.
- **لا إعلان جاهزية وفي الخطّة بند مؤجَّل بلا موعد.**
- **الملخّص ليس الملف.**
- **أي رسالة تشير إلى مسار خارج worktree الجلسة ⇒ توقّف قبل
  التنفيذ.**

## نمط العمل

خمسة مسارات في `docs/11`: `mediakit` (‏`mk`, main — توثيق دائم
غير محسوب، ويُحسب مسارَ بناء حين يمسّ `packages/*`) ·
`mk-api` (‏`mkapi`, feat/api) · `mk-studio` (‏`mkst`,
feat/studio) · `feat/dashboards` (لم يُفتح) · `mkaudit`
(‏`mkau`، قراءة فقط، غير محسوب).

**مساران كاتبان لا ثلاثة** — المراجعة هي القيد.

Opus يخطّط ← Muhammed يلصق ← Claude Code ينفّذ ← يعيد التقرير.
المستودع خاص ولا يصله Claude.ai.

**التحرّي:** ثمانية كواشف، يُستدعى ولا يعمل تلقائياً. وكل كاشف
ينجح مرة يتحوّل إلى سكربت.

**بوابة التزامن لا تُفتح بتقرير** — دليل تنفيذي مسجَّل في
`PHASES-api.md`.

## الدروس الحاكمة

عناوين فقط — النصوص في `LESSONS.md` (67 درساً).

- **L-17** لا بوابة بصرية تُعلَن قبل النظر إلى المخرج
- **L-22** المكوّنات تستقبل مفاتيح لا نصّاً
- **L-46** اختبار الثبات لا يكشف الغياب
- **L-53** التقرير الذي يعلن الإنجاز ليس دليلاً عليه
- **L-54** القاعدة بلا فرض آلي تُنسى بصمت
- **L-57** `git log` + `status` + `push` في كل تقرير
- **L-58** الاستثناء الموثَّق يبقى ثغرة
- **L-61** سياسة RLS واحدة تُخفي ولا تمنع
- **L-62** `UNIQUE` على nullable ليس قيداً — حين يكون التفرّد
  مقصوداً للصفوف الفارغة
- **L-63** السكيل يُكتب من الملفات لا من الذاكرة
- **L-66** المصادر مراتب لا أنداد
- **L-67** `.git` حالة مشتركة لا ملف جلسة

## القرارات المحسومة

- الكيان بريطاني أو أوروبي · Paddle بلا حاجز · الدفع الشخصي بلا
  قيد. و`mada`/`KNET` مزوّد إقليمي ثانٍ بجانبه — مسجَّل لا مبنيّ.
- الباقات: `trial · starter · studio · agency · api`.
- الحدود بيانات في `plans` + `plan_overrides` — المالك يغيّرها
  بلا نشر.
- مستوى التحكّم بسياسات صريحة، صفر `BYPASSRLS`.
- واجهة الخط الزمني ⇒ المرحلة 4، في مسار S لا T (2026-09-02).
- **العرض الأول يشمل فيديو بخطّ العميل** لا بطاقات وحدها.
- التنبيهات: **BullMQ repeat** كل خمس دقائق · webhook عام
  والقناة وسيط تشغيلي خارج المنتج.
- أول مزوّد TTS: **Google**.
- النطاق: **`docs/09` هو المرجع**.

## القرارات المعلّقة

- القدرات الخمس في `docs/07` — أيّها يُجدوَل؟
- الثلاثة من `docs/12`: النماذج القابلة للمشاركة · القصّ الذكي ·
  واجهة التفريغ.
- مجموعة القياس الموسومة لبوابتي 3.5 — يصنعها المالك.
- قياس فكّ ترميز مقطع 20 ثانية على العتاد — **شرط قبل أي
  التزام تعاقدي** (`docs/08`).
- عمق لوحة المالك: كل رقم قابل للنزول إليه (2026-09-07).

## عند الشك

- لا تخترع قيمة رقمية — كلها في `docs/03`.
- إن اقتضى الحل مخالفة قاعدة من التسع، توقّف واعرض المقايضة.
- الكود بالإنجليزية، النقاش والتوثيق بالعربية.
- لا تفترض وجود كود — تحقّق.
- **ولا تقرأ ملخّصاً وتحسبه الملف.**
<!-- END:DICTATED -->
