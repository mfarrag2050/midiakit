# 17 — خطة تنفيذ المرحلة الرابعة

> **الغاية:** ترجمة `docs/16-api-contract.md` إلى ترتيب بناء عملي على
> مسارَين متوازيَين، بأدنى انتظار متبادل.
>
> **ما هذا الملف:** خطة تنفيذ (ماذا يُبنى، بأيّ ترتيب، من يحتاج ماذا).
> **ما ليس هذا الملف:** قرارات معمارية معلَّقة (مصادقة · اشتراكات · عزل
> مستأجرين) — الخطة تستوعب أيّ قرار فيها، وتُميّز البنود المرتبطة
> صراحةً كي تُملأ عند الحسم.

---

## 1. المسارَان — نظرة موجزة

**التوسّع على قاعدة `docs/11-parallel-work.md`:** المسار **P** فيها كان
واحداً (`feat/platform`)؛ الحجم الفعلي يستدعي **قسمته إلى مسارَين**
لأن الواجهة والبنية عملان مختلفان بمهارات مختلفة، والانتظار المتبادل
يتضاعف لو جمعا في فرع واحد.

| المسار | الفرع | المجلد | الملفات المملوكة |
|---|---|---|---|
| **A — البنية (mk-api)** | `feat/api` | `~/MediaKit/pf-mediakit-api` | `apps/api/` · `infra/` · `packages/db/` (جديد) · migrations |
| **S — الواجهة (mk-studio)** | `feat/studio` | `~/MediaKit/pf-mediakit-studio` | `apps/studio/` · `packages/ui/` (جديد) |

**قاعدة الملكية المطلقة:**
- **A** لا يعدّل `apps/studio/*` مطلقاً — يعرض العقد ويترك الاستهلاك للـS.
- **S** لا يعدّل `apps/api/*` مطلقاً — يستهلك عبر HTTP، يبلّغ عن الفجوة إن وجدت.
- كلاهما يشتركان في `packages/shared/` (أنواع البيانات) — التعديل هنا يحتاج تنسيقاً (ينقل عبر main).

**tmux:**
```bash
alias mka='tmux a -t mk-api    -d 2>/dev/null || tmux new -s mk-api    -c ~/MediaKit/pf-mediakit-api'
alias mks='tmux a -t mk-studio -d 2>/dev/null || tmux new -s mk-studio -c ~/MediaKit/pf-mediakit-studio'
```

**منافذ (ضمن 19000–19099 الحصرية للمشروع — CLAUDE.md):**
- **A** — 19040 (API) · 19041 (dev DB) · 19042 (test DB)
- **S** — 19050 (Next.js dev)

`main` يبقى على 19000–19029 · `dash` على 19030–19039 · هذه التوسعة تحترم النطاق.

---

## 2. نطاق mk-api

### 2.1 ما يبنيه A

- **قاعدة البيانات:** كل الجداول (tenants, users, brand_kits, projects, templates, renders, assets, revisions, workflows, project_state, transitions, annotations, ai_integrations, subscriptions, usage) + migrations.
- **RLS:** سياسات على كل جدول تحت مستأجر (`tenant_id` من session).
- **المصادقة:** JWT + refresh (شكل §2 من docs/16) — التنفيذ الفعلي معلَّق على قرار المالك.
- **REST API:** كل endpoints §2–§16 من docs/16.
- **Webhooks:** استقبال Stripe/Paddle (§16).
- **تكامل الطوابير:** ربط `POST /renders` بـBullMQ (المرحلة 3 جاهزة).
- **تكامل الخدمات المعزولة:** استدعاء `services/diacritizer` · `services/transcriber` · `services/face-detector` عبر HTTP.
- **AI proxy:** `POST /v1/ai/invoke/:capability` (§15.4 من docs/16 — قرار B3).
- **`brand_snapshot`:** التقاط ذرّي عند `POST /renders`.
- **triggers للـrevisions:** على brand_kits · projects · templates · users · assets.
- **workflow engine:** تنفيذ transitions مع تحقّق دور + حالة صالحة.
- **حصص + rate limits:** بحسب الباقة (§17 من docs/16).

### 2.2 ما يبنيه S

- **تخطيط عام (App shell):** إطار Next.js + Tailwind + توجيه صفحات.
- **مكوّنات مشتركة (`packages/ui/`):** أزرار، حقول، جداول، مودالات، تنبيهات — نظام تصميم موحَّد.
- **صفحات المصادقة:** login · signup · forgot-password · reset-password.
- **لوحة العميل (`/client`):** تُوسَّع من `apps/dashboard/` القائم (المرحلة 3.2).
- **محرّر Brand Kit:** كل حقول `docs/03` كواجهة قابلة للتحرير مع معاينة حية.
- **مكتبة القوالب + المُختار:** عرض القوالب المتاحة + إضافة قالب مستأجر.
- **مساحة عمل المشروع (Project Workspace):** المكوّن الأثقل — محرّر محتوى + معاينة + خط زمني + تحرير كابشن + تعليقات.
- **منتقي الأصول + الرفع:** تكامل مع `POST /v1/assets/upload-url` + `finalize`.
- **إدارة workflow:** تحوّلات الحالة + إسناد + قوالب سير جاهزة.
- **صفحات الفوترة:** عرض الاشتراك + الاستهلاك + الفواتير.
- **إعدادات AI:** إدخال مفاتيح BYO-key + تفعيل القدرات.
- **i18n:** ar/mixed/en (L-22 — مفاتيح لا نصوص من الخادم).

---

## 3. ترتيب البناء داخل mk-api — حرج

**قاعدة العمود الفقري:** ما يعتمد عليه الآخر يُبنى أوّلاً. اختراق هذا
الترتيب = إعادة عمل بعد الحسم.

### 3.1 قاعدة البيانات + RLS (الأساس — كل شيء يعتمد عليه)

- **A1.** إعداد PostgreSQL + أداة migrations (choice deferred — Drizzle / Prisma / plain SQL — قرار A).
- **A2.** جداول `tenants` + `users` مع RLS مفعَّلة (`FORCE ROW LEVEL SECURITY`).
- **A3.** آلية `SET LOCAL app.tenant_id = <من JWT>` قبل كل معاملة.
- **A4.** **بوابة عزل المستأجرين** (G-P4-1، §7) — تُجتاز قبل بناء أي مورد آخر.

### 3.2 المصادقة (كل endpoint يعتمد عليها)

- **A5.** جدول `sessions` (أو JWT-only بلا جدول — قرار مالك).
- **A6.** endpoints `/v1/auth/*` (signup · login · refresh · logout · forgot · reset).
- **A7.** middleware يفكّ JWT ويضبط `app.tenant_id` و `req.user`.
- **A8.** بوابة اختبار مصادقة (G-P4-2).

### 3.3 الأعمدة الأساسية — يمكن التوازي داخلها

من هنا فصاعداً، بعض البنود مستقلّة وتقبل التوازي بين مطوّرَين على `feat/api`.

**المجموعة الأولى (بعد A8):**
- **A9.** Tenants (GET/PATCH `/v1/tenant`).
- **A10.** Users (list/get/invite/patch/delete + إعادة إسناد المشاريع — قرار B1).
- **A11.** Assets (upload-url + finalize + list/get/delete + refresh-url + detect-faces + patch faces).

**المجموعة الثانية (بعد A9-A10):**
- **A12.** Brand Kits (list/get/create/patch/delete + font-ack + logo-ack + assets-version).
- **A13.** Templates (list/get/create/patch/delete).

**المجموعة الثالثة (بعد A12-A13):**
- **A14.** Projects (list/get/create/patch/delete).
- **A15.** Workflows (list/get/create/patch/delete).
- **A16.** Project State + Transitions + Assign.
- **A17.** Annotations (segmentIndex — قرار B4).

**المجموعة الرابعة (بعد A11-A17):**
- **A18.** Renders (create مع brand_snapshot + list/get/output/brand-snapshot/cancel/delete).
- **A19.** ربط الطوابير (تكامل مع apps/renderer الموجود).

**المجموعة الخامسة (مستقلّة عن الرندر — يمكن أن تُبنى بالتوازي مع A14-A19):**
- **A20.** Revisions system + triggers + endpoints الاستعادة.
- **A21.** Subscriptions + webhooks (يعتمد على قرار المالك).
- **A22.** Usage tracking.

**المجموعة السادسة (بعد A21):**
- **A23.** Rate limits enforcement (بحسب باقة الاشتراك — §17 docs/16).
- **A24.** AI Integrations (POST/GET/DELETE) + AI invoke proxy (§15.4).

### 3.4 لوحة `/ops` الإدارية

- **A25.** توسيع `apps/dashboard/ops/` القائم بمقاييس المرحلة 4 (subscriptions · usage · حصص متجاوزة).

---

## 4. ترتيب البناء داخل mk-studio

**قاعدة:** S يبني على mockings حين ينتظر A. المكوّنات المشتركة (`packages/ui/`)
وإطار Next.js لا تنتظر شيئاً.

### 4.1 المرحلة الصفر (بلا انتظار A)

- **S1.** إطار Next.js + Tailwind + توجيه + i18n.
- **S2.** `packages/ui/` — نظام تصميم موحَّد (زر، حقل، جدول، مودال، تنبيه، menu، tabs، form).
- **S3.** طبقة استهلاك API عامة: fetcher + معالجة أخطاء موحّدة (يفكّ `error.code` + `error.field` من §1.4 docs/16) + معالجة 401 (auto-refresh) + معالجة 429 (retry-after).
- **S4.** طبقة i18n: قواميس ar/mixed/en، فك مفاتيح `error.message` (L-22).

### 4.2 بعد A4 (بوابة RLS)

- **S5.** صفحات المصادقة (login/signup/forgot/reset) — تستهلك `/v1/auth/*` عبر mocks حتى A6-A8، ثم تنتقل إلى الحقيقي.

### 4.3 بعد A8 (مصادقة حقيقية)

- **S6.** ربط صفحات المصادقة بالخلفية الحقيقية.
- **S7.** التخطيط الرئيسي (sidebar + header + user menu + tenant name).

### 4.4 بعد A11 (Assets)

- **S8.** منتقي الأصول + رفع (upload-url flow) + عارض معرض الأصول.

### 4.5 بعد A12 (Brand Kits)

- **S9.** محرّر Brand Kit — كل الحقول من `docs/03` + تكامل ack للخطوط.
- **S10.** واجهة `assets.version` مع فروق (قبل الترقية).

### 4.6 بعد A13 (Templates)

- **S11.** مكتبة القوالب + عرض تفصيلي.

### 4.7 بعد A14 (Projects)

- **S12.** قائمة المشاريع + إنشاء مشروع + محرّر content بحسب template.fields.
- **S13.** معاينة حية (تستدعي `renderFrame` في المتصفح — الكود موجود، الواجهة تربطه).

### 4.8 بعد A15-A16 (Workflows)

- **S14.** شريط حالة المشروع + أزرار transitions + إسناد.
- **S15.** إعدادات workflow في إعدادات المستأجر.

### 4.9 بعد A17 (Annotations)

- **S16.** تعليقات موضعية (segment-level) + شريط جانبي للتعليقات.

### 4.10 بعد A18-A19 (Renders)

- **S17.** زرّ التصدير + قائمة أحجام + حالة الطابور (يستهلك ETA من مساحة 3.2).
- **S18.** سجل التصديرات + تحميل + عرض `brand_snapshot` (مقارنة مع الحالي).

### 4.11 بعد A20 (Revisions)

- **S19.** سجل مراجعات كل مورد + استعادة (مع سبب إلزامي).

### 4.12 بعد A21-A22 (Subscriptions + Usage)

- **S20.** صفحات الفوترة + عرض الحصص + زرّ الترقية.

### 4.13 بعد A24 (AI)

- **S21.** إعدادات AI (إدخال مفاتيح، تفعيل قدرات).
- **S22.** استعمال قدرات AI في مساحة المشروع (اقتراحات عناوين، تعليق صوتي، إلخ) — كل مخرج **حقل قابل للتحرير** (L-13).

---

## 5. جدول التبعيات — نقاط التزامن

**قاعدة القراءة:** «S-X يحتاج A-Y منتهياً» = S-X لا يُدمج قبل توفّر A-Y.
S يستطيع البدء بـmock، لكن الاختبار الحقيقي والدمج ينتظر.

| S | يعتمد على A | Endpoint(s) الحرجة |
|---|---|---|
| S1–S4 | لا شيء | — |
| S5 | A6 (auth endpoints موجودة) | `/v1/auth/*` |
| S6 | A7-A8 (middleware + بوابة) | نفسها + تحقّق حقيقي |
| S7 | A9 | `GET /v1/tenant` |
| S8 | A11 | `POST /v1/assets/upload-url` + `finalize` |
| S9 | A12 (كامل، بما فيها ack) | `/v1/brand-kits/*` + `/fonts/:family/ack` |
| S10 | A12 (فرع `assets-version`) | `POST /v1/brand-kits/:id/assets-version` |
| S11 | A13 | `/v1/templates/*` |
| S12 | A14 | `/v1/projects/*` |
| S13 | لا (يستعمل المحرك مباشرة) | — |
| S14 | A15 + A16 | `/v1/workflows/*` + `/v1/projects/:id/state`, `/transitions` |
| S15 | A15 | `POST/PATCH /v1/workflows` |
| S16 | A17 | `/v1/projects/:id/annotations` |
| S17 | A18 (على الأقل POST + GET) | `POST /v1/renders` + `GET /v1/renders/:id` |
| S18 | A18 كامل | `/v1/renders` + `/output` + `/brand-snapshot` |
| S19 | A20 كامل | `/v1/{resource}/:id/revisions` + `/restore` |
| S20 | A21 + A22 | `/v1/subscription/*` + `/v1/usage/*` |
| S21 | A24 (integrations part) | `/v1/ai/integrations` |
| S22 | A24 (invoke part) | `POST /v1/ai/invoke/:capability` |

**نقاط التزامن الحاكمة (Sync Points):**

| نقطة | ما يفتحها | ما تُطلقه في S |
|---|---|---|
| **SYNC-α** | A8 (مصادقة نهائية) | S6, S7 |
| **SYNC-β** | A12 + A13 | S9, S10, S11 |
| **SYNC-γ** | A14 | S12, S13 |
| **SYNC-δ** | A15+A16+A17 | S14, S15, S16 |
| **SYNC-ε** | A18+A19 | S17, S18 |
| **SYNC-ζ** | A20 | S19 |
| **SYNC-η** | A21+A22 | S20 |
| **SYNC-θ** | A24 | S21, S22 |

**إن قصّر A في مجموعة، مجموعة S المرتبطة تنتظر — لكن **مجموعات S الأخرى تُكمل**. لا انتظار متتالٍ.

---

## 6. القرارات المعلَّقة — الخطة تستوعبها

**ثلاث قرارات عند المالك. الخطة تُبنى بحيث لا تنكسر عند أيّ خيار:**

### 6.1 المصادقة — قرار A

**الخيارات الشائعة:**
1. **JWT ذاتي التحقّق (stateless) + refresh token في DB** — mk-api يوقّع، لا تخزين للـaccess في القاعدة.
2. **جلسات مخزَّنة (opaque tokens) + جدول `sessions`** — كل token صف في PostgreSQL.
3. **مزوّد خارجي (Clerk · Auth0 · Supabase Auth)** — outsource.

**كيف تستوعب الخطة:** كل الخيارات تنتج نفس شكل الاستجابة (§2 docs/16) —
اعتماد شكل الـheader `Bearer <token>` كافٍ. **الفرع A** يحسم داخلياً
دون تغيير العقد.

**بند مؤجَّل:** جدول `sessions` في §3.1 يظهر بين قوسين — يُنشأ إن اختار
المالك الخيار 2. الخياران 1 و3 لا يحتاجانه.

### 6.2 الاشتراكات — قرار B

**الخيارات:**
1. **Stripe** — الأشهر، دعم اشتراكات ناضج.
2. **Paddle** — يتولّى VAT/الضرائب تلقائياً للسوق الخليجي.
3. **بلا مزوّد للـMVP** — التعامل يدوي، فوترة عبر بريد.

**كيف تستوعب الخطة:** الحقول في `GET /v1/subscription` (§13.1 docs/16)
عامّة (`plan`, `status`, `currentPeriodEnd`) — تعمل مع أي مزوّد.
webhook endpoint واحد `/v1/webhooks/{provider}` (§16.1) — يُعرَّف
مسار المزوّد المُختار عند البدء.

**بند مؤجَّل:** بند A21 يبقى «هيكل جداول + webhook stub» حتى يُحسم المزوّد.
الواجهة (S20) تُبنى على البيانات المكتشفة، بغضّ النظر عن المصدر.

### 6.3 عزل المستأجرين (RLS) — قرار C

**الخيارات:**
1. **RLS على مستوى PostgreSQL + `SET LOCAL app.tenant_id`** — الأمان في القاعدة، لا يعتمد على انضباط المطوّر (توصية docs/02:164).
2. **فلترة برمجية في mk-api** — كل استعلام يضيف `WHERE tenant_id = ...` يدوياً.
3. **قاعدة منفصلة لكل مستأجر** — عزل فيزيائي كامل (رفض ADR-007 — طبقة تسعير لا معمارية).

**كيف تستوعب الخطة:** بغضّ النظر عن الاختيار، **بوابة G-P4-1** (§7)
هي المعيار — «مستأجر لا يرى بيانات آخر». الخيار 1 مُوصى به في مصادر
المشروع، لكن الخطة تقبل الآخرين إن مرّت البوابة.

**بند حرج:** A2-A4 هي البوابة نفسها — لا يمرّ أيّ endpoint آخر قبل
اجتيازها. **حتى مع تأجيل قرار المصادقة/الاشتراكات، هذا القرار لا يُؤجَّل**
— يُتَّخذ يوم 1 من مسار A.

---

## 7. بوابات المرحلة 4 — بمنطق L-46

كل بوابة تُصنَّف: **وجود** (يعمل عبر النطاق) · **ثبات** (لا يتغيّر بلا سبب) ·
**اختبار سلبي** (يفشل صراحةً في الحالة التي يجب أن يفشل فيها).

### G-P4-1 — عزل المستأجرين (الأهمّ)

**النوع:** كلاهما + اختبار سلبي.
**السكربت:** `scripts/verify-tenant-isolation.mjs` (الأساس موجود في PHASES-docs الصادر — يُحدَّث للمرحلة 4).

**ما يفحصه:**
1. **وجود:** جلسة `tenant_A` تستعلم كل جدول تحت مستأجر — تعيد سجلاتها فقط.
2. **ثبات:** الاستعلام نفسه على مدى 100 استدعاء — نتائج متطابقة.
3. **اختبار سلبي:** جلسة `tenant_A` تحاول قراءة/كتابة سجل بـID مستأجر آخر — تعيد 404 (لا 403 — 403 يكشف الوجود).
4. **اختبار سلبي حاسم — تعطيل RLS:** يعيد تشغيل ADR بلا `SET LOCAL app.tenant_id` — يجب أن يفشل الاختبار كله فوراً. **بلا هذا، RLS نظرياً فقط.**

**النجاح:** الأربعة تمرّ.
**الفشل:** أيّ استعلام يعود ببيانات غير المستأجر، أو الاختبار السلبي بلا RLS يمرّ خطأً.

### G-P4-2 — نقاء المصادقة

**النوع:** وجود + اختبار سلبي.

**ما يفحصه:**
1. **وجود:** كل endpoint في §4-§16 يرفض 401 بلا Bearer صالح.
2. **اختبار سلبي:** JWT مزيّف، منتهي، بـtenant_id مختلف عن المستخدم، أو مبتور — كلها 401.

### G-P4-3 — اكتمال سجل المراجعات

**النوع:** وجود + ثبات.

**ما يفحصه:**
1. **وجود:** كل PATCH ناجح على brand_kits/projects/templates/users/assets يُنشئ سجل revisions.
2. **ثبات:** استعادة revision قديم تعيد الحالة **بايت-بايت** (JSON عميق).

### G-P4-4 — ثبات `brand_snapshot`

**النوع:** ثبات + اختبار سلبي.

**ما يفحصه:**
1. **ثبات:** إنشاء render بـproject P → snapshot يُختزن. تعديل P.brand_kit → snapshot المُخزَّن لا يتغيّر.
2. **اختبار سلبي:** محاولة PATCH على `brand_snapshot` مباشرة → 405 `METHOD_NOT_ALLOWED` (الحقل قراءة فقط).

### G-P4-5 — المفاتيح لا تُعاد

**النوع:** اختبار سلبي.

**ما يفحصه:**
- كل استجابة تحوي `apiKey` كسلسلة (grep على response bodies في اختبار AI) → **صفر مطابقات**.
- `GET /v1/ai/integrations` لكل مزوّد → الحقل `apiKey` غير موجود، `apiKeyRef` فقط.

### G-P4-6 — `licenseAck` إلزامي

**النوع:** اختبار سلبي.

**ما يفحصه:**
- محاولة `POST /v1/assets/:id/finalize` لخط أو Lottie بـ`licenseAck: false` → 422 `LICENSE_ACK_MUST_BE_TRUE`.
- محاولة `POST /v1/brand-kits/:id/attribution/logo-acks/:platform` بـ`licenseAck: false` → 422 نفسه.
- محاولة تفعيل `logoMode: 'official'` قبل logo-ack → 422 `LICENSE_ACK_REQUIRED`.

### G-P4-7 — صلاحية Workflow

**النوع:** وجود + اختبار سلبي.

**ما يفحصه:**
1. **وجود:** كل transition معرَّف في workflow يقبل التنفيذ بالدور الصحيح ويُغيّر الحالة.
2. **اختبار سلبي:** transition من حالة غير الحالية → 409. دور ناقص → 403. `reason` مفقود لتحوّل يطلبه → 400.

### G-P4-8 — استرجاع الحصص

**النوع:** وجود.

**ما يفحصه:**
- تجاوز `videos_month` في الباقة → 402 `QUOTA_EXCEEDED_VIDEOS`.
- تجاوز rate limit → 429 مع رأس `Retry-After`.

### G-P4-9 — تدفّق المشروع نهاية-لنهاية

**النوع:** وجود (الأشمل).

**ما يفحصه:**
- سيناريو كامل: signup → إنشاء brand_kit → رفع خط + ack → إنشاء project → PATCH content → POST render → GET output → استعادة revision → حذف — كل خطوة تعطي 2xx.

### G-P4-10 — تكامل i18n

**النوع:** وجود.

**ما يفحصه:**
- كل استجابة خطأ تحمل `error.message` كمفتاح UPPER_SNAKE — grep على response bodies يبحث عن نصوص لغة طبيعية.
- الواجهة تعرض ترجمة صحيحة للمفاتيح المسجَّلة في قاموس ar/mixed/en.

---

## 8. ما لا يُبنى في المرحلة 4

**قائمة صريحة — تفادي انتفاخ النطاق:**

| البند | لماذا يُؤجَّل |
|---|---|
| **API عام + SDK** | بند المرحلة 5 (`docs/01`) — `/v1/` الحالي داخلي، فصل `/v1/internal/` عن `/v1/public/` عند بدء المرحلة 5 (Q15 في §18 docs/16) |
| **إشعارات real-time (WebSocket/SSE)** | polling كافٍ للـMVP (Q16 حُسم في docs/16) — الترقية على بند بعينه لا النظام |
| **تكاملات النشر المباشر** (Buffer, Later) | بند المرحلة 5 |
| **استيراد Figma / Canva** | مذكور في `PHASES.md §المرحلة 4` كبند «جذب» — يُبنى بعد بوابة العميل الأول |
| **قاعدة منفصلة لكل مستأجر** | ADR-007 — طبقة تسعير لا معمارية |
| **تطبيق موبايل native** | خارج النطاق نهائياً — Studio متجاوب يكفي |
| **White-labeling** (تخصيص واجهة العميل) | يُدرس في المرحلة 5 لو طلبته وكالة كبرى |
| **Analytics متقدّم** (funnels, cohorts) | لوحة `/ops` الحالية + Grafana على السجلات كافية للـMVP |
| **حذف مستأجر (GDPR-style)** | مسار «archive tenant» يكفي — الحذف الفعلي بند قانوني منفصل |
| **بحث نصّي كامل عبر المشاريع** | فلترة بحسب حقول محدَّدة تكفي — full-text search كلفة index كبيرة بلا طلب |
| **مشاركة نماذج قابلة للـtemplate customization** (docs/12 §6) | Q17 معلَّق — يُبنى بعد الحسم |

**قاعدة الحدّ:** أيّ بند يُطرح أثناء التنفيذ وليس مذكوراً في `docs/16`
أو في هذه الخطة — **يُوقَف ويُحوَّل قرارُه للمالك** (L-27، L-32).

---

## 9. بنية الجلسات والفروع

**بروتوكول docs/11 مطبَّق:**

### 9.1 الإعداد (مرة واحدة على الميني)

```bash
cd ~/MediaKit/pf-mediakit

git worktree add ../pf-mediakit-api    -b feat/api
git worktree add ../pf-mediakit-studio -b feat/studio

git worktree list
```

### 9.2 جلسات tmux

```bash
tmux new -d -s mk-api    -c ~/MediaKit/pf-mediakit-api
tmux new -d -s mk-studio -c ~/MediaKit/pf-mediakit-studio
```

### 9.3 ملفات الحالة

- `PHASES-api.md` في `~/MediaKit/pf-mediakit-api/` — حالة A.
- `PHASES-studio.md` في `~/MediaKit/pf-mediakit-studio/` — حالة S.
- تُدمج في `PHASES.md` عند دمج الفرع.

### 9.4 قواعد الجلسة الفرعية (تُلصق في بداية كل جلسة)

```
أنت على فرع <feat/api أو feat/studio> في مجلد <PATH>، ضمن عمل متوازي.

اقرأ: CLAUDE.md · docs/11-parallel-work.md · docs/16-api-contract.md ·
docs/17-phase4-plan.md · PHASES-<api أو studio>.md

ملفات مقفلة على main: راجع docs/11.
ملفات مقفلة على المسار الآخر:
- إن كنت على feat/api: apps/studio/* · packages/ui/* ممنوعة
- إن كنت على feat/studio: apps/api/* · infra/* · migrations ممنوعة

اكتب حالتك في PHASES-<track>.md لا في PHASES.md.
تحقّق من فرعك قبل أي commit: git branch --show-current
```

### 9.5 المزامنة اليومية

- كل صباح: `git fetch origin && git rebase origin/main` (على كل فرع).
- كل نهاية أسبوع: مراجعة نقاط التزامن (§5) — أي مجموعة A منجزة تفتح مجموعة S.
- تعارض في `packages/shared/`: يوقَف ويُبلغ main لتنسيقه.

### 9.6 قاعدة سقف الفرع

**سقف عمر الفرع: أسبوع.** أطول من ذلك → dispatch الفرع إلى main
(dispatch = merge نهائي) وابدأ فرعاً جديداً بنطاق أضيق. حماية من drift
كبير يستحيل دمجه.

---

## 10. تقدير المدة

**التقدير مبدئي — يُراجَع بعد أوّل أسبوع فعلي (L-05).**

| المرحلة | A (mk-api) | S (mk-studio) | ملاحظة |
|---|---|---|---|
| 1. RLS + Auth (A1-A8) | أسبوع | S1-S4 بالتوازي — بلا انتظار | البوابة الأهمّ |
| 2. الأعمدة الأساسية (A9-A17) | 2-3 أسابيع | S5-S16 مع نقاط التزامن | الأثقل |
| 3. Renders + Revisions (A18-A20) | أسبوع | S17-S19 | يعتمد على تكامل الطوابير الجاهزة |
| 4. Subs + Usage + AI (A21-A24) | أسبوع | S20-S22 | مستقلّة، تقبل التوازي |
| 5. `/ops` + ختامي | نصف أسبوع | نصف أسبوع | بوابات + i18n |

**الإجمالي:** 5-6 أسابيع على المسارَين المتوازيَين. **مطابق لتقدير
`PHASES.md §المرحلة 4`** (6-8 أسابيع مع هامش).

**بوابة الإصدار الأوّل بعد المرحلة 4:** «عميل يعمل ذاتياً من التسجيل
حتى التصدير بلا تدخّلك» (PHASES.md:874).

---

## 11. مراجع

- `docs/16-api-contract.md` — العقد الكامل (13 مورداً · 19 قسماً)
- `docs/11-parallel-work.md` — قواعد المسارات المتوازية
- `docs/13-asset-lifecycle.md` — نظام إصدارات الأصول
- `docs/14-revisions.md` — سجل المراجعات + الاستعادة
- `docs/15-editorial-workflow.md` — الحالات · الأدوار · التحوّلات
- `PHASES.md §المرحلة 4` — النطاق الكامل + البنود من مسح الميزات
- `CLAUDE.md §بوابات التوقّف` — L-17, L-32, L-33 مطبَّقة على القرارات المعلَّقة
- `docs/LESSONS.md §L-46` — قاعدة اختبار الوجود مقابل الثبات

**قواعد ملزَمة عبر التنفيذ:**
- **L-04:** رمي مبكّر عند حدود النظام — كل تحقّق مدخل في mk-api يفشل بوضوح.
- **L-22:** رسائل الخادم مفاتيح لا نصوص.
- **L-27:** أيّ بند غير مذكور هنا يُوقَف ويُحوَّل للمالك.
- **L-32:** «لا تفعل X قبل Y» بوابات توقّف — القرارات الثلاثة المعلَّقة (§6) لا تُفترض إجاباتها.
- **L-46:** كل بوابة تحمل اختبار وجود + ثبات + سلبي كما يقتضي طبعها.
