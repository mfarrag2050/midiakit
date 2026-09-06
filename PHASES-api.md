# PHASES-api.md

> حالة مسار **mk-api** (فرع `feat/api` · مجلد `~/MediaKit/pf-mediakit-api/`).
> يُدمج في `PHASES.md` عند اندماج الفرع (بواسطة جلسة main).
>
> **النطاق:** apps/api · infra · migrations · packages/db.
> **الممنوع:** packages/engine · packages/templates · packages/shared ·
> apps/studio · apps/dashboard · snapshots · demo.
>
> **مرجع الخطة:** `docs/17-phase4-plan.md §3` · **العقد:** `docs/16` ·
> **قرار العزل:** `docs/02 §ADR-011`.

---

## القاعدة الحاكمة (2026-09-04) — لا BYPASSRLS إطلاقاً

**لا دور بـBYPASSRLS في المنظومة إطلاقاً. ولا SUPERUSER يستخدمه التطبيق.**

أيّ حاجة تبدو تستدعي تجاوزاً هي مؤشر على سياسة ناقصة لا على ضرورة تجاوز.
عالجها بسياسة، وإن تعذّر — توقّف واسأل.

### الحالتان اللتان قد تُثاران خطأً

**إنشاء مستأجر** (قبل وجود `tenant_id` في الجلسة): يُحلّ بسياسة خاصة
على `tenants` تسمح بالإدراج، والقراءة مقيّدة بالانتماء عبر جدول العضوية
(`users`). لا تجاوز.

**المهام الخلفية** (BullMQ workers): العامل يعرف `tenant_id` المهمة من
حقل الطابور — يضبط `SET LOCAL app.tenant_id` في معاملته قبل أوّل استعلام.
لا تجاوز.

### الحماية الآلية

- `infra/postgres/init/01-roles.sql` يُنشئ `migration_user` و `app_user`
  بـ`NOSUPERUSER NOBYPASSRLS`.
- G-P4-1 (`packages/db/scripts/verify-isolation.mjs`) يضيف فحص **وجود**
  صريحاً (L-46): لا دور في القاعدة يحمل `rolbypassrls = true`. أيّ دور
  جديد ينشأ بلا حرص = فشل البوابة.

---

## القاعدة الثانية (2026-09-04) — signed URLs بلا استثناء

**كل مسار مخرَج يُخدَم عبر signed URL بانتهاء صلاحية. المفاتيح الخام
(`storage_key`, `output_storage_key`) لا تُعاد في أيّ استجابة، ولا تُرَنْدَر
كروابط مباشرة، ولا تُخمَّن بالتسلسل.**

**لماذا لا يكفي RLS:** RLS يحمي القراءة من القاعدة. المخرَج (بطاقة، فيديو)
يُخدَم من S3/R2 عبر HTTP مباشر بلا مرور بالقاعدة. رابط قابل للتخمين ==
بطاقة عميل تُقرأ بلا مصادقة أصلاً.

### الحماية الآلية — أين تُبنى، ولا تُبنى الآن

| المكوّن | الموضع | يبنى في |
|---|---|---|
| مغلَّف موحَّد `apps/api/src/storage/signed-url.ts` | مغلَّف واحد يُستدعى من كل endpoint يعيد رابط أصل/تصدير | مع بدء A11 |
| `POST /v1/assets/upload-url` (signed PUT للرفع) | docs/16 §9.1 | A11 |
| `POST /v1/assets/:id/refresh-url` (signed GET بانتهاء) | docs/16 §9.5 | A11 |
| `GET /v1/assets/:id` — يعيد `publicUrl` موقَّت لا `storage_key` | docs/16 §9.4 | A11 |
| `GET /v1/renders/:id/output` — signed URL بصلاحية ساعة | docs/16 §8.4 | A18 |
| G-P4-11 — منع تسرّب المفاتيح الخام | فحص عبر endpoint responses | تُفعَّل مع A11 |

**اسم المفتاح الخام (`storage_key`, `output_storage_key`) في المخطط يبقى
داخلي القاعدة. أيّ استجابة تحويها = فشل G-P4-11.**

---

## القاعدة الثالثة (2026-09-04، مُحدَّثة 2026-09-04 A8+) — دالتا SECURITY DEFINER

**في المنظومة كلها، هناك دالتا SECURITY DEFINER فقط، كلتاهما ضمن نطاق
`auth_lookup` وكلتاهما تعيد اختزالاً لا صفوفاً خامة:**

1. `find_user_by_email(citext)` (A5) — يعيد
   (user_id, tenant_id, role, password_hash, is_active).
2. `count_failed_login_attempts(email, ip, since)` (A8+ hardening) —
   يعيد (email_count, ip_count) — عددان، لا صفوف.

**أيّ طلب لإضافة ثالثة يمرّ بموافقة صريحة من المالك.** السبب: كل دالة
SECURITY DEFINER ثغرة محتملة في الحاجز؛ نضبطها بحدّ ثقة واحد
(`auth_lookup`) وحقول اختزال (لا PII خام).

القيود المُلزَمة (مطبَّقة على الاثنَين):
1. **الحد الأدنى المُعاد فقط.** لا اسم، لا هاتف، لا حقول شخصية.
   `find_user_by_email` يعيد بيانات اعتماد + metadata لـsession.
   `count_failed_login_attempts` يعيد عددَين.
2. **الاستجابة لا تكشف الوجود.** بريد موجود وغير موجود يعطيان نفس
   ApiError ونفس التوقيت (fake argon2 hash + توقيت متقارب — G-P4-2 يقيسه).
3. **الدور المالك `auth_lookup`:** NOLOGIN + NOSUPERUSER + NOBYPASSRLS
   + سياسة SELECT-فقط على `users` و `login_attempts` فقط (لا صلاحية
   على أيّ جدول آخر). USAGE+CREATE على schema public (شرط ملكية الدالة).
4. **`SET search_path = pg_catalog, public`** داخل الدوال — يمنع
   اختطاف المسار.
5. **REVOKE ALL FROM PUBLIC + GRANT EXECUTE TO app_user** لكل دالة.

**G-P4-1 يحرس:**
- الدوال تعيد الحقول المعلَنة فقط.
- `auth_lookup` لا يستطيع SELECT على `brand_kits` أو أيّ جدول آخر.
- `app_user` لا يستطيع SELECT مباشراً على `login_attempts` (A8+ fix).
- `app_user` grants على `login_attempts` = [INSERT] فقط.

---

## بند مؤجَّل (2026-09-04) — عضوية جمعية للمستخدم

**الحالة:** المخطط الحالي 1:1 (`users.tenant_id NOT NULL`). البريد
فريد عالمياً (`UNIQUE(email)`)، فتخفيف القيد إلى n:m يحتاج migration
لاحقة تُنشئ جدول `memberships(user_id, tenant_id, role)` وتحدّث
السياسات والاستعلامات.

**قرار المالك 2026-09-04:** الواجهة `single-tenant` في الإصدار الأوّل.
لا مبدّل ولا قائمة اختيار. تعقيد كل شاشة («في أيّ وكالة أنا؟») +
تعقيد الفوترة + الأدوار = تكلفة عالية مقابل حالة نظرية.

**التفعيل بشرط:** أوّل مستخدم فعلي يحتاج الانتماء إلى أكثر من مستأجر
(مصمم مستقل، مستشار). عندها تُبنى migration `memberships` + تُحدَّث
السياسات + تُنقل بيانات users.tenant_id إلى memberships + G-P4-1
يُوسَّع + الواجهة تُضيف مبدّل.

**سلوك عابر في A5-A8:** `find_user_by_email` يعيد `tenant_id` واحداً
(كافٍ لـsingle-tenant). لو تجاوز مستخدم هذا القيد بشكل ما لاحقاً،
الجلسة تختار الأوّل ولا تعرض قائمة، مع تحذير في السجل.

---

## البنية المعتمدة

| القرار | المصدر | الحالة |
|---|---|---|
| PostgreSQL 16 + RLS + FORCE | ADR-011 | ✅ ثابت |
| مستخدما القاعدة الوحيدان: `migration_user` + `app_user` | القاعدة الحاكمة أعلاه | ✅ ثابت |
| أداة migrations: `node-pg-migrate` (MIT) | ATTRIBUTIONS.md §mk-api | ✅ ثابت |
| مصادقة ذاتية بجلسات مخزَّنة + argon2id PHC | docs/17 §3.2 · القرار 2 | ⏳ A5-A8 |
| Paddle كـMerchant of Record | docs/17 §6.أ القرار 3 | ⏳ A21 |
| منافذ dev: 19040 (API) · 19041 (dev DB) · 19042 (test DB) | docs/17 §2 | ✅ ثابت |

---

## المهام — الحالة

### المجموعة A: قاعدة البيانات + RLS + المصادقة

| البند | العنوان | الحالة | ملاحظة |
|---|---|---|---|
| A1 | البنية الأساسية للقاعدة + المستخدمان | ✅ | commit `9bb1e1a` |
| **A2** | المخطط الكامل + RLS+FORCE | ✅ | 16 جدولاً، كلها rowsecurity=t + forcerowsecurity=t، سياسات ALL على 15، 4 سياسات على tenants (INSERT مفتوح، الباقي مقيّد) |
| A3 | آلية `SET LOCAL app.tenant_id` | ✅ | `app_set_tenant(uuid)` + `withTenant` / `withoutTenant` في packages/db/src |
| A4 | **G-P4-1** بوابة عزل المستأجرين | ✅ | `pnpm verify:tenant-isolation` — 1.52s، 17 جدولاً، ANY_TENANT + FORCE، سلبيّتان حاسمتان، revisions-orphan، auth_lookup، find_user_by_email |
| **A5** | schema المصادقة + find_user_by_email | ✅ | password_reset_tokens (RLS+FORCE) + login_attempts (استثناء موثّق) + users.is_active + auth_lookup + الدالة الوحيدة SECURITY DEFINER |
| **A6** | `auth/session.ts` — الطبقة الوحيدة | ✅ | argon2id PHC + jose HS256 + sessions قابلة للإبطال + refresh rotation + rate limit + constant-time. `pnpm --filter @pf-mediakit/api smoke:auth` يمرّ. |
| **A7** | Fastify server + authenticated hook + routes | ✅ | preHandler واحد (authenticated) يجمع JWT verify + session check + tx open + SET LOCAL. onResponse/onError يقفلان الـtx. 6 endpoints في /v1/auth/*. HTTP smoke: signup 201، logout 204، revoked 401، bad token 401. |
| **A8** | **G-P4-2** بوابة نقاء المصادقة | ✅ | `pnpm verify:auth` — 4 طبقات، 18+ فحصاً، timing 1.02× |

### المجموعة B — Tenants → Users → Assets → Brand Kits → Templates → …

> **تنبيه ترقيم (2026-09-05):**
> ما سُمّي في رسائل الالتزام A9.1–A9.4
> (`ac863a4` · `4827975` · `389c35f` · `9540215`) هو **A12 (Brand Kits)**
> في `docs/17`. التسمية بدأت في المحادثة قبل مراجعة docs/17 وتتابعت
> في ثلاثة أطراف بلا أن يفتح أحدهم الملف.
> التاريخ المدفوع لا يُعاد كتابته. **كل إشارة من هنا فصاعداً تستعمل
> ترقيم `docs/17` وحده.**
> الحالة: **A9-A20 + A26 + A27 + A18.5 + A18.6 + A21 + A22 + A23 مبنية جميعاً.**
>
> **الترتيب التالي (محسوم 2026-09-05):**
> جواب تحرّي A9-V أثبت أن `config` في A12 يحمل `url` نصّياً حرّاً (صفر
> `assetId` في المستودع) — لا تبعية بنيوية بين A12 و A11. الترتيب
> يتبع docs/17: **A9 → A10 → A11.**

| البند | العنوان | الحالة | ملاحظة |
|---|---|---|---|
| **A9** | Tenants (GET/PATCH `/v1/tenant`) | ✅ | `pnpm verify:tenant` — G-P4-4، 6 طبقات، 27 فحصاً. انحرافات معلَنة عن docs/16 §3: id UUID خام (لا `tnt_`)، `plan` enum مختلف، `seats.limit=null` حتى تُعرَّف الخرائط. |
| **A10** | Users + invite (5 endpoints) | ✅ | `pnpm verify:users` — G-P4-5، 6 طبقات + 3 حالات خاصة + auth_lookup discrimination. جدول `invitations` جديد + 6 أكواد أخطاء. **بند مؤجَّل:** قبول الدعوة (accept-invite) — يُبنى في مرحلة لاحقة، الرمز الحالي مُنشأ لكن غير قابل للاستهلاك (dev log ينبّه). **بند مؤجَّل:** reassignedProjects/deletedDrafts ثابتتان 0 حتى A14. |
| **A11** | Assets (8 endpoints) | ✅ | `pnpm verify:assets` — G-P4-6، **7 طبقات** + 11 حالة سلبية. جدول assets مُوسَّع بـ6 أعمدة (ackBy/ackAt/filename/sizeBytes/contentType/warnings). طبقة تخزين مجرَّدة: memory (in-process test) + s3 (`@aws-sdk/client-s3` + `s3-request-presigner`، SDK رسمي بلا fetch). **A11-STORAGE (2026-09-05):** MinIO في `bin/mk` على 19043 + init container ينشئ bucket، فdev يسلك مسار الإنتاج (STORAGE_DRIVER=s3). Layer 7 يُثبت: PUT/GET حقيقيان بـfetch خارج العملية، رابط منتهي الصلاحية يُرفض (403)، رابط لمفتاح مُعدَّل يُرفض (403). قرار #1: assetId في `brand_kits.config` — `filter[inUse]` يطابق عليه حصراً عبر JSONPath. **بند مؤجَّل:** كشف الوجوه الفعلي (docs/12). **بند مؤجَّل:** SEATS_EXHAUSTED/STORAGE_QUOTA_EXCEEDED معلَنان غير مُنفَّذين حتى A21. **بند مؤجَّل:** استخراج FontCaps من ملف الخط. **بند لم يُبنَ:** توحيد مسار تخزين الرندر (يستعمل `apps/renderer/src/cli.ts:resolveFontPath` قرصاً محلياً — راجع تقرير A11-STORAGE §4). |
| **A12** | Brand Kits (8 endpoints) | ✅ | list/get/create/patch/delete + font-ack + logo-ack + assets-version. `pnpm verify:brand-kits` — 6 طبقات + Layer 3.5 (RFC 7396). commits: `ac863a4`, `4827975`, `389c35f`, `9540215`, `712020d`. **A9-V كشف نقص fill-in عند القراءة — بند 10، لم يُصلَح.** |
| **A13** | Templates (5 endpoints) | ✅ | `pnpm verify:templates` — G-P4-7، 7 طبقات + طبقة العام (مستأجر جديد يرى الستة، النسخ لا يمسّ الأصل، check-template-sync L-46). **النمط الموحَّد للبيانات المرجعية العامة** (يرثه A26 لـplans): سياسات أربع منفصلة (SELECT/INSERT/UPDATE/DELETE)، رفض عن global بـ403 من التطبيق (لا 404 من صفر صفوف — L-61). أعمدة جديدة: source_ref + definition_hash + deleted_at. البذر من `packages/templates/src/templates/*.json` داخل الهجرة نفسها. فهرسان جزئيّان: `(name) WHERE scope='global'` و `(tenant_id, name) WHERE scope='tenant' AND deleted_at IS NULL` (L-62). check-template-sync يحرس مصدرَي الحقيقة (الحزمة + DB). **قرار #1:** لا `/duplicate` (العقد يعرّف 5 نقاط لا 6). **قرار #2 (ADR-012):** بذر + مرجع/بصمة + حارس. **قرار #3:** soft delete. **انحراف مُعلَن:** filter[kind] يقبل static/video (قيم template.kind الفعلية) لا card/breaking/reel كما في §6.1 (Q4 مفتوح). |
| **A14** | Projects (5 endpoints) | ✅ | `pnpm verify:projects` — G-P4-8، 6 طبقات + 5 حالات خاصّة. 4 أعمدة جديدة (state/assignee_id/locale/deleted_at) + CHECK على locale. 8 أكواد أخطاء جديدة (BRAND_KIT_NOT_FOUND · TEMPLATE_NOT_FOUND · WORKFLOW_NOT_FOUND · PLAN_LIMIT_REACHED · LOCALE_UNSUPPORTED · TRANSITION_ROLE_REQUIRED · STALE_UPDATE · PROJECT_HAS_RENDERS). **البند 1 من التذكرة محسوم:** (أ) DELETE user يُنفَّذ إعادة الإسناد الفعلي (§4.5 B1) — reassignedProjects/deletedDrafts صحيحان الآن. (ب+ج) template_snapshot + brand_snapshot **موضعهما A18** (§8 صريح: «يُلتقطان عند POST /renders»). Q5 حُسم: PROJECT_HAS_RENDERS يرفض الحذف. **انحرافات مُعلَنة:** DB يستعمل `name` والعقد يستعمل `title` (Mapper يوحّد على title). PATCH لا يفرض workflow state role check (يُبنى في A15 — الكود مُعلَّم TRANSITION_ROLE_REQUIRED). STALE_UPDATE معلَن غير مُنفَّذ حتى A20. PLAN_LIMIT_REACHED معلَن غير مُنفَّذ حتى A21. سجل revisions لإعادة الإسناد بند A20. |
| **A15** | Workflows (5 endpoints) | ✅ | `pnpm verify:workflows` — G-P4-9 مشترك. CRUD كامل، states+transitions JSONB مع validator محلّي (WORKFLOW_SCHEMA_VIOLATION). CANNOT_DELETE_DEFAULT + WORKFLOW_IN_USE + WORKFLOW_IN_USE_IMMUTABLE_FIELD (409). **لا بذر افتراضي** — العقد صامت؛ التوصية للاستوديو presets تُقدَّم عند الإعداد الأوّل. |
| **A16** | State + Transitions + Assign (3 endpoints) | ✅ | G-P4-9. state يجمع currentState + availableTransitions المشتقة + history من جدول transitions. TRANSITION_ROLE_REQUIRED (403) + TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE (409) + REASON_REQUIRED_FOR_THIS_TRANSITION (400) + PROJECT_HAS_NO_WORKFLOW (409). assign بـ`editor+` (Q7 مؤقّت). **project_state جدول غير مستعمل** — projects.state/assignee_id هي المصدر (تكرار في المخطط). |
| **A17** | Annotations (4 endpoints) | ✅ | G-P4-9. target JSONB {kind:'layer', layer, segmentIndex} مطابق §12 (B4). LAYER_NOT_FOUND + INVALID_SEGMENT_INDEX. RBAC: viewer+ للإنشاء، المؤلّف أو editor+ للـPATCH، المؤلّف أو admin+ للـDELETE. |
| **A18** | Renders (8 endpoints) | ✅ | `pnpm verify:renders` — G-P4-10، 7 طبقات. brand_snapshot + template_snapshot يُلتقطان ذرّياً عند POST — تعديل brand_kit بعدها لا يمسّ اللقطة (اختبار Layer 7-هـ). RENDER_CONCURRENCY_LIMIT ثابت=3 (A21 يحلّه من plan). Idempotency-Key مدعوم. cancel + delete صحيحان. **MVP التخزين:** UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS يرفض brand فيها assetId أو URL خارجي (S3/HTTP) — worker يعمل مع brand مضمّنة فقط. حلّ SDK كامل في renderer بند مؤجَّل. |
| **A19** | Queue integration (BullMQ) | ✅ | G-P4-10 Layer 7. `apps/api/src/queues/` توأمة لـ`apps/renderer/src/queues.ts` — نفس أسماء الطوابير (render-urgent/normal/edit/batch) + prefix pf-mediakit + Fair-share priority (`count(waiting same tenant) × 10 + 1`). POST /renders يُدخل job في render-normal (أو render-urgent) بشحنة كاملة (renderId + snapshots + content). Layer 7 يُثبت end-to-end: POST → Redis (7 مفاتيح) → worker inline → MinIO PUT → GET /output signed URL → fetch حقيقي بايتات PNG صحيحة. |
| **A20** | Revisions (3 endpoints × 5 موارد) | ✅ | `pnpm verify:revisions` — G-P4-11. **DB triggers على 5 جداول** (brand_kits · projects · templates · users · assets) تكتب revisions تلقائياً على INSERT/UPDATE/DELETE — صفر انضباط handlers. `app_set_actor(uuid)` GUC جديد يُضبَط من auth-guard. factory pattern لواحد أو 15 endpoint (`GET :id/revisions` · `GET :id/revisions/:revId` · `POST :id/revisions/:revId/restore`). restorableColumns مصرَّحة لكل مورد. **STALE_UPDATE مُطلَق الآن** (§7.4): `If-Match: <updated_at ISO>` header اختياري على PATCH /projects — إن قُدِّم بقيمة قديمة → 409. البند A10 محسوم: user delete يُنشئ revision صريح بـaction='reassign' + reason لكل مشروع مُعاد إسناده. |
| **A23** | Rate limits enforcement (وسيط بحسب الباقة) | ✅ | `pnpm verify:a23` — G-P4-18، 6 طبقات + 7 حالات. **قرارات المالك 2026-09-08:** (1) cache TTL **60 ثانية** in-memory — رفعاً وخفضاً؛ التغيير يظهر خلال دقيقة كحدّ أقصى. عند cluster: يُستبدل Map بـRedis بلا تغيير منطق. (2) IP-based **30/دقيقة** ثابت قبل المصادقة (auth/webhooks) — checkLoginRateLimit يبقى طبقة ثانية. (3) رمز الخطأ **`RATE_LIMIT_EXCEEDED`** (§17) — TOO_MANY_ATTEMPTS يبقى للـauth (معنى منفصل). (4) `/v1/health` مستثنى **على المسار الحرفي** — لا نمط ولا بادئة (يمنع نمو الاستثناءات). **البنية:** `apps/api/src/plugins/rate-limit-by-plan.ts` مغلَّف بـ`fastify-plugin` لكسر الحاوية (onRoute يُطلق للـroutes في نفس الحاوية فقط) + `apps/api/src/plugins/plan-limits-cache.ts` (TTL في مكان واحد: `PLAN_LIMITS_CACHE_TTL_MS = 60_000`). keyGenerator يعمل full JWT verify — decode بلا توقيع = ثغرة bucket-spoofing (مهاجم يعزل نفسه في bucket مزيَّف)؛ verifyAccessToken المشترك مع authGuard تُكرَّر (~<1ms HS256، مقبول). max ديناميكي async يقرأ من cache. `RateLimitExceededError extends ApiError` يمرّ عبر error-handler كـApiError (رمي كائن عادي = 500، شرح مسجَّل). حذف تسجيل `@fastify/rate-limit` 300/IP القديم من server.ts. `RATE_LIMIT_DISABLE=1` env مضاف لكل verify:* السابقة (تفادي 60/دقيقة يقتل السلاسل بـ100+ inject) — verify:a23 وحدها لا تُعطّله. **إصلاح جانبي:** verify:a23 ينظف `login_attempts` بعده (Layer 6-ب يستنفد IP rate limit عن قصد ⇒ verify:a21 التالي كان يسقط). 283/283 اختبار يمرّ. |
| **A22** | Usage tracking (trigger على renders + 2 endpoints) | ✅ | `pnpm verify:a22` — G-P4-17، 6 طبقات + 8 حالات. **قرارات المالك 2026-09-08:** (1) trigger DB على renders (نمط A20 log_revision — L-58 · صفر انضباط من المعالج) بدل كتابة تطبيقية · (2) فترة **تقويمية** (`date_trunc('month', now())::date`) — تعمل للحساب اليدوي (بلا subscription) وحسابات الاشتراك سواء (docs/17:229) · (3) `video_seconds` يبقى 0 معلَناً حتى A24 (docs/01 يحدّ بالعدد لا بالثواني). **هجرة `20260908020000_a22-usage-trigger.ts`:** يضيف `usage.videos_count` + دالة `log_render_usage()` SECURITY DEFINER + trigger `renders_log_usage` AFTER INSERT OR UPDATE OF status. الشرط الصارم: `NEW.status='succeeded' AND (INSERT OR OLD.status IS DISTINCT FROM 'succeeded')` — UPDATE succeeded→succeeded لا يعدّ مرتين (اختبار حاسم). failed لا يزيد (تحويلة صريحة إلى succeeded وحدها). **UPSERT** على (tenant_id, period) — الشهر الأول يُدرج، اللاحق يُحدّث. **إصلاح ثغرة A21:** كان `POST /renders` يعدّ من `renders` بينما `GET /subscription` يعرض من `usage` (0) — مصدران متباعدان. A22 وحّدهما على `usage`: `renders/create.ts:101-109` و `subscription/get.ts:44-51` كلاهما يقرأ من `usage.videos_count` الآن. **endpoints:** GET `/v1/usage/current` (periodStart/End · counts.{rendersTotal,videos,videosSeconds,storageBytes} · limits · byBrandKit مُشتقّ من renders GROUP BY project.brand_kit_id) + GET `/v1/usage/history` (filter[period][gte/lte] YYYY-MM · sort=-period · غلاف §1.5). RBAC: viewer+ (docs/16 §14.1). **byBrandKit** يُشتقّ من renders (نفس مصدر الحقيقة الذي يُطلق trigger — ليس مصدراً منفصلاً). 283/283 اختبار يمرّ. |
| **A21** | Subscriptions + Paddle + فرض الحصص (7 endpoints) | ✅ | `pnpm verify:a21` — G-P4-16، 6 طبقات + 8 حالات. **المحوّل الحاكم** (`apps/api/src/payments/`): interface `PaymentsProvider` + `FakeProvider` (HMAC-SHA256 · deterministic) + factory env-driven (`PAYMENTS_PROVIDER=fake\|paddle`). قاعدة بنيوية: اسم المزوّد يبقى داخل `payments/` — الحارس `check:no-paddle-outside-payments` يفرضها (0 مخالفة في 96 ملف API). المسار عُمِّم إلى `/v1/webhooks/subscription` (**انحراف مُعلَن** عن docs/17 §A21 الذي سمّاه `/paddle`) — تطبيقاً لقاعدة القرار 3، إضافة Tap/PayTabs/Moyasar = نفس URL بمحوّل مختلف. **6 endpoints:** GET/checkout/cancel(reason≥10)/resume/invoices/webhook. RBAC: owner على write، admin+owner على read، webhook بلا Bearer + توقيع HMAC. **فرض 4 حصص** من `getEffectiveLimits`: SEATS_EXHAUSTED (invite users+invitations نشطة) · PLAN_LIMIT_REACHED (brand-kits/create) · QUOTA_EXCEEDED_VIDEOS (renders/create · شهري · mp4 فقط · صف failed مستثنى) · QUOTA_EXCEEDED_RENDERS (concurrency من plan لا `config.RENDER_CONCURRENCY_LIMIT`). plan_overrides يعلو حصرياً. مستأجر بلا صفّ subscriptions ⇒ يُعامل «حساب يدوي» (docs/17:229 — يقرأ حدوده من plans + الفرض يعمل). **تدفّق webhook:** verify signature عبر محوّل → parseEvent → INSERT/UPDATE subscriptions + UPDATE tenants.plan (control_plane pool). **هجرتان جديدتان:** `checkout_sessions` (Idempotency-Key) + منح INSERT/UPDATE/DELETE على subscriptions + UPDATE على tenants لـcontrol_plane_user. `check-control-plane-policies` وسِّع بالجدول الجديد. 283/283 اختبار يمرّ. |
| **A26** | طبقة الإعداد (plans + plan_overrides) | ✅ | `pnpm verify:plans` — G-P4-12، 6 طبقات + طبقة البيانات المرجعية. جدول `plans` (5 صفوف مبذورة: trial/starter/studio/agency/api) مطابق docs/16 §17 + docs/01. `tenants.plan` من CHECK إلى FK (ON DELETE RESTRICT). `tenants.plan_overrides jsonb` — مفتاح موجود يعلو، غائب يُقرأ من plans (لا دمج غامض). `getEffectiveLimits(client, tenantId)` قراءة فقط — الفرض في A21/A23. **نمط A13 مُعاد استعماله حرفياً** (ADR-012): قراءة عامة (`FOR SELECT USING true`)، كتابة `migration_user` فقط (السياسة). L-58: `app_user` = SELECT فقط. حارس `check:plan-sync` (نمط A13): يفشل عند تعديل قيمة يدوياً — يفرض الهجرة. **المقاسات ومنصّات الشعارات مؤجَّلتان** (البند 4): `default-brand.ts` مقفل + العقد لا يفرض النقل الآن. |
| **A27** | مستوى التحكّم (control plane) | ✅ | `pnpm verify:control-plane` — G-P4-13. **قرار 1: الخيار A** — دور جديد `control_plane_user` (LOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT) يعبر RLS بسياسات صريحة على 21 جدولاً (18 tenant-scoped + plans + platform_users + platform_sessions). جدول بلا سياسة control_plane ⇒ 0 صفوف للمالك (صمت بالانحياز للأمان). حارس `check:control-plane-policies` يفرض السياسات على كل جدول. **قرار 2: الخيار A** — جدول `platform_users` منفصل + `/v1/platform/auth/login` + JWT بسرّ منفصل (`PLATFORM_JWT_SECRET`) + `platform_sessions` منفصل + `platform-auth-guard` منفصل. app_user يحمل صفر منح على platform_*. `POST /login`, `POST /logout`, `GET /tenants`, `GET /tenants/:id` (مع effectiveLimits), `PATCH /tenants/:id` (plan + planOverrides). **البند 3:** validation على planOverrides — مفتاح مجهول → 400 IMMUTABLE_FIELD، قيمة سالبة → 400 VALIDATION_FAILED. **إصلاح جانبي:** backfill grants على 18 جدولاً قديماً (fresh db:reset كان يفقدها بعد SEC-1 lockdown). |
| **A18.5** | ربط العامل بالتخزين (real worker) | ✅ | `pnpm verify:a18-5` — G-P4-14. **العامل الحقيقي في عملية منفصلة** (`apps/renderer/src/api-worker.ts`) يستهلك جوَّاً من Redis، يفكّ assetIds من brandSnapshot → download من MinIO عبر @aws-sdk/client-s3 → FontLibrary.use بمسارات محلّية (لا fallback) → skia-canvas render PNG → PUT إلى MinIO → UPDATE renders (SET LOCAL app.tenant_id). **L-46 محقَّق:** حذف الأصل من MinIO ⇒ status=failed مع error_code=FONT_ASSET_FETCH_FAILED. UNSUPPORTED_BRAND_HAS_EXTERNAL_ASSETS **ضاق** — assetId مسموح (worker يفكّه)، URL خارجي (http/https/mem/s3) مرفوض (SSRF). check-no-brand-url-fetch بصفر استثناء (SDK فقط). **البند 4:** trigger `log_revision` وسّع إلى tenants + revisions.actor_id بلا FK (dual-source: users OR platform_users). platform PATCH يُنشئ revision.actor_id=platform_user.id. |
| **A18.6** | توصيل العامل بالمحرّك (MP4 حقيقي) | ✅ | `pnpm verify:a18-6` — G-P4-15، 6 طبقات. **الخيار A محسوم:** `worker.ts` حُذف، `api-worker.ts` وحيد يستهلك الطوابير الأربع (urgent/normal/edit/batch) بالحصّة العادلة (`ceil((urgent+normal)/2)` per-tenant cap عبر Redis INCR/DECR) والمهل (30s/180s/600s/بلا) — كلها منقولة من worker.ts قبل الحذف. **الشكلان المدعومان في router على مفتاح `renderId`:** (1) API-shape → `processApiJob` يستدعي `validateTemplate(templateSnapshot)` ثم إن `format==='mp4'` → `renderVideo({template,brand,content,size,outPath})` (FFmpeg direct pipe · docs/08 · L-46) وإلا canvas.toBuffer('png') · يرفع إلى MinIO · UPDATE renders؛ (2) CLI-shape → `processCliJob` يستعمل `TEMPLATES[templateId]` (للسكربتات التطويرية). **G-P4-15 يُثبت:** ffprobe يرى `codec_name=h264 1080x1080 duration=7.5s` (لا PNG بديل) · قياس عرض النص يكشف الخط المرفوع بـ8.0% (عتبة 5% مُختارة بعد baseline: bold=1005.3px vs fallback=930.6px) · log line "font loaded" في stdout · template_snapshot جامد بعد تعديل template الأصلي · L-46 حذف الأصل → FONT_ASSET_FETCH_FAILED · check-no-brand-url-fetch يمرّ. **السكربتات الخمسة الموروثة** (test-isolation · dashboard-screenshot · dashboard-locales-screenshot · dashboard-eta-check · test-peak-load) أُعيد توجيهها إلى `@pf-mediakit/renderer/api-worker` عبر legacy alias (`export const startWorkers = startApiWorker`). `observe.ts` أُعيد ربطه إلى api-worker. **283/283 اختبار يمرّ.** |

**تحذير مسجَّل (فخّ للمستقبل — L-63):**
- `projects.name` في القاعدة و `title` في العقد §7. Mapper يوحّد على `title` في السلك. الجدول له مراجع من annotations · project_state · renders · transitions — هجرة إعادة تسمية مكلفة. لن يُصلَح، لكنه فخّ لمن يكتب استعلاماً مباشراً على الجدول.
- `project_state` جدول قائم من A2 مع أعمدة (current_state, assignee_id, workflow_id) تُكرّر ما في `projects` بعد A14. A15/A16 لم يستعمله — كل الحالة في `projects`. الجدول يبقى بلا استعمال حتى تُحسم إزالته أو ترحيل الحالة إليه.

---

## نقاط التزامن

- **SYNC-α · فُتحت 2026-09-05 · المسار المُسلِّم: mk-api**
  الدليل: `POST /v1/auth/login` على `127.0.0.1:19040` → 200 بجسم يحمل
  `session.accessToken` (JWT HS256). ثلاثة استدعاءات شكل: كلمة سرّ
  خاطئة → 401 `INVALID_CREDENTIALS`، حقل ناقص → 400 `VALIDATION_FAILED`
  مع `field: "password"`، GET /v1/brand-kits بـBearer → 200 بجسم
  `{data,nextCursor,hasMore}`. المخرَج الحرفي في تقرير SYNC-α.
  **يُطلق:** S6 · S7 على mk-studio.

- **SYNC-β · فُتحت 2026-09-06 · المسار المُسلِّم: mk-api**
  الدليل: templates + brand-kits + assets-version على
  `127.0.0.1:19040` (MinIO على `127.0.0.1:19043`) — كل النقاط
  تعيد الشكل الذي يعرّفه العقد (§6 · §5 · §1.5)، بما في ذلك:
  الستة العامة من `filter[scope]=global`، `POST /templates` نسخة
  خاصة من عام (201)، PATCH/DELETE على عام → 403
  `GLOBAL_TEMPLATE_READONLY`، `POST /fonts/:family/ack`
  بـ`licenseAck=false` → 422، `POST /assets-version` بلا
  `acknowledgedDiff` → 409. المخرَج الحرفي في تقرير SYNC-β.
  **يُطلق:** S9 · S10 · S11 على mk-studio.

- **SYNC-γ · فُتحت 2026-09-06 · المسار المُسلِّم: mk-api**
  الدليل: projects + workflows + transitions + assign + annotations
  + renders + revisions على `127.0.0.1:19040` (Redis
  `127.0.0.1:6379/3` بادئة `pf-mediakit` + MinIO 19043). كل النقاط
  تعيد الشكل الذي يعرّفه العقد (§7 · §11 · §12 · §8 · §10 · §1.5)،
  بما في ذلك: PATCH بـIf-Match قديم → 409 STALE_UPDATE، PATCH
  بـstate → 400 IMMUTABLE_FIELD، submit من draft → review + history
  1، submit مرة أخرى → 409 TRANSITION_NOT_AVAILABLE_FROM_CURRENT_STATE،
  annotations CRUD كامل، POST /renders → 202 مع snapshot_ids،
  OUTPUT_NOT_READY على queued، revisions.ops = [update, update,
  update, insert] بعد PATCHات، restore يعيد الاسم الأصلي، DELETE
  مشروع بلا renders → 204، DELETE مشروع له renders → 409
  PROJECT_HAS_RENDERS. المخرَج الحرفي في تقرير SYNC-γ.
  **يُطلق:** S12 · S13 على mk-studio.

- **SYNC-δ · فُتحت 2026-09-06 · المسار المُسلِّم: mk-api**
  الدليل: workflows + state + transitions + assign + annotations على
  `127.0.0.1:19040`. كل النقاط تعيد الشكل الذي يعرّفه العقد (§11 · §12
  · §1.5)، بما في ذلك: POST /v1/workflows → 201 (isDefault=true،
  states=3، transitions=3)، GET /v1/workflows بغلاف §1.5، PATCH → 200،
  DELETE على default → 409 CANNOT_DELETE_DEFAULT، DELETE على مستعمل →
  409 WORKFLOW_IN_USE، POST /transitions submit (writer) → 200 مع
  history+actor، writer يحاول approve → 403 TRANSITION_ROLE_REQUIRED،
  reviewer approve بلا reason → 400 REASON_REQUIRED_FOR_THIS_TRANSITION،
  POST /assign → 200، annotations CRUD كامل + LAYER_NOT_FOUND + 400
  INVALID_SEGMENT_INDEX (target.segmentIndex). المخرَج الحرفي في
  تقرير SYNC-δ. **يُطلق:** S14 · S15 · S16 على mk-studio.

  **بنود للاستوديو (لا تخالف العقد):**
    1. PATCH /projects/:id يبقى writer+ (§11 لا يعرّف editableBy لكل state)
    2. workflows بلا بذر — الاستوديو يعرض 3 presets + POST عند الاختيار
    3. project_state جدول قائم غير مستعمل (كل الحالة في projects)

---

## البوابات — الحالة

| البوابة | الوصف | الحالة |
|---|---|---|
| **G-P4-1** | عزل المستأجرين على كل جدول (وجود + ثبات + 3 سلبيات + ANY_TENANT + revisions-orphan + لا-BYPASSRLS) | ✅ passed 2026-09-04 |
| **G-P4-2** | نقاء المصادقة (grep guard + HTTP + non-disclosure + rate limit) | ✅ passed 2026-09-04 |
| **G-P4-3** | Brand Kits (وجود + عزل 404-لا-403 + سلبي + RBAC + L-58/L-59 + policy-off-fails) | ✅ passed 2026-09-05 |
| **G-P4-6** | Assets (7 طبقات: وجود 8 + عزل 6-methods + سلبي 11 + RBAC editor/writer + L-58 + policy-off حاسم + **Layer 7 حدّ خارجي: PUT/GET حقيقيان + expired-URL + tampered-key**) | ✅ passed 2026-09-06 |
| **G-P4-11** | signed URLs — لا تسرّب مفاتيح خام في أيّ استجابة | ✅ passed 2026-09-06 — مضمَّن في G-P4-6 (§9.4/§9.5 يعيدان publicUrl موقَّت لا storage_key؛ mapper لا يكشف storage_key؛ القائمة بلا publicUrl صراحةً) |
| G-P4-3-rev | اكتمال سجل المراجعات (بند مؤجَّل — رقم سيُعاد ترقيمه عند A20) | ⏳ |
| **G-P4-5** | Users + invite (6 طبقات + 3 حالات خاصة + auth_lookup discrimination) | ✅ passed 2026-09-06 |
| **G-P4-4** | Tenants (وجود + عزل + سلبي + RBAC + L-58 + policy-off SELECT/UPDATE منفصلَين) | ✅ passed 2026-09-05 |
| G-P4-4-brand-snapshot | ثبات `brand_snapshot` (بند لاحق — سيُعاد ترقيمه) | ⏳ |
| G-P4-5 | المفاتيح لا تُعاد | ⏳ |
| G-P4-6 | `licenseAck` إلزامي | ⏳ |
| **G-P4-7** | Templates (7 طبقات: وجود 5 + عزل + سلبي 5 + RBAC + L-58 + policy-off حاسم + **Layer 7 العام: مستأجر جديد يرى 6 + نسخ لا يمسّ الأصل + check-template-sync L-46**) | ✅ passed 2026-09-06 |
| G-P4-7-workflow | صلاحية Workflow (الاسم القديم — أُعيد ترقيمه بـG-P4-9) | ✅ |
| **G-P4-9** | Workflows + State + Transitions + Annotations (6 طبقات: وجود 13 · عزل 8 · سلبي 8 · RBAC 7 · L-58 على 4 جداول · حاسم على 3 جداول) | ✅ passed 2026-09-06 |
| **G-P4-8** | Projects (6 طبقات + 5 حالات خاصة: قالب عام يعمل · قالب مستأجر آخر يُرفض · TEMPLATE_IN_USE · BRAND_KIT_IN_USE · user delete reassign) | ✅ passed 2026-09-06 |
| G-P4-8-quotas | استرجاع الحصص (الاسم القديم — سيُعاد ترقيمه عند A21) | ⏳ |
| **G-P4-10** | Renders + Queues (7 طبقات: وجود 8 + عزل 6 + سلبي 3 + RBAC 4 + L-58 + حاسم + **E2E: POST→Redis→Worker→MinIO→GET output→fetch bytes + snapshot frozen**) | ✅ passed 2026-09-06 |
| **G-P4-11** | Revisions (6 طبقات + حالة (د): triggers على 5 جداول · restore عبر factory · STALE_UPDATE بـIf-Match · user delete → revisions.action=reassign) | ✅ passed 2026-09-06 |
| **G-P4-12** | plans + plan_overrides (7 طبقات: وجود · سلبي (FK) · RBAC (app_user لا يكتب) · L-58 (SELECT فقط) · حاسم (GRANT وحده يحرس بلا RLS) · طبقة البيانات المرجعية (override يعلو · حذف مستعمل → RESTRICT · check:plan-sync L-46)) | ✅ passed 2026-09-06 |
| **G-P4-13** | Control plane (6 طبقات + 7 خاصّة: platform token على tenant route → 401 · tenant token على platform → 401 · planOverrides بمفتاح مجهول → 400 · viewer PATCH → 403 · صفر منح app_user على platform_* · صفر BYPASSRLS · تعطيل سياسة → 0 صفوف · check-control-plane-policies L-46) | ✅ passed 2026-09-07 |
| **G-P4-14** | A18.5 (رندر حقيقي في عملية منفصلة: 8 خطوات — upload font PUT حقيقي + brand assetId + POST /renders + spawn api-worker + succeeded + font log line + fetch bytes + L-46 delete asset → failed) + revision على PATCH tenants بـactor_id=platform_user | ✅ passed 2026-09-07 |
| **G-P4-15** | A18.6 (MP4 حقيقي: 6 طبقات — spawn api-worker + POST /renders format='mp4' succeeded + **ffprobe: h264 1080x1080 duration=7.5s** (لا PNG بديل · لا استرداد صامت) + قياس عرض النص يُثبت الخط المرفوع بـ8.0% ≥ عتبة 5% + log "font loaded" في stdout + template_snapshot جامد بعد تعديل الأصل + L-46 حذف أصل → FONT_ASSET_FETCH_FAILED + check-no-brand-url-fetch يمرّ) | ✅ passed 2026-09-08 |
| **G-P4-16** | A21 (Subscriptions + Paddle: 6 طبقات + 8 حالات — 5 endpoints /v1/subscription + webhook · reason<10→400 · resume بلا اشتراك→404 · عزل مستأجرين بحدود مختلفة (starter=1 · studio=5 brand kits) · viewer→403 على checkout · admin→403 على checkout owner-only · admin→200 على GET · check-no-paddle-outside-payments (0 مخالفة، 96 ملف) · بلا اشتراك: plan=starter من plans + الفرض يعمل · SEATS_EXHAUSTED (starter=2) · plan_overrides.seats_limit=20 يعلو ⇒ invite ينجح · PLAN_LIMIT_REACHED (starter=1 brand kit) · QUOTA_EXCEEDED_VIDEOS (trial=5 videos/شهر) · webhook توقيع مزيَّف → 400 · توقيع صحيح → 200 + subscriptions.plan=studio + tenants.plan تحدَّث) | ✅ passed 2026-09-08 |
| **G-P4-17** | A22 (Usage tracking: 6 طبقات + 8 حالات — trigger renders_log_usage موجود · GET /usage/current + /history يعملان بغلاف §1.5 · عزل مستأجرين (A videos=1 · B videos=0) · **failed لا يعدّ** (A21 يستثنيه، A22 يطابقه) · **UPDATE succeeded→succeeded لا يعدّ مرتين** (WHEN OLD IS DISTINCT FROM — اختبار حاسم) · png +renders لا +videos · UPDATE queued→succeeded +videos · viewer→200 على GET (§14.1) · **المصدر الواحد:** current.counts.videos == usage.videos_count == حدّ POST /renders (المفروض) · plan_overrides.videos_per_month_limit=999 يعلو على المعروض كما على المفروض · فترة سابقة (شهران قبل) تظهر في history لا current) | ✅ passed 2026-09-08 |
| **G-P4-18** | A23 (Rate limits بحسب الباقة: 6 طبقات + 7 حالات — ترويسات x-ratelimit-limit=60 · **عزل مستأجرين بحدّين مختلفين** (starter 60 يبلغ 429 · studio 180 لا يبلغ — الاختبار الحاسم أن الحدّ مقروء من الباقة لا رقم ثابت) · شكل 429 = RATE_LIMIT_EXCEEDED + retryAfter numeric + Retry-After header · plan_overrides.rpm=500 يعلو بعد clearCache (الأثر فوري داخل الاختبار — TTL 60s هو الحدّ الطبيعي بلا clear) · /v1/health مستثنى (100/100 = 200 بلا x-ratelimit-*) · ما قبل المصادقة IP 30/min على /v1/auth/login (بلا JWT) · ارتداد A21 concurrent renders من الباقة | ✅ passed 2026-09-08 |
| G-P4-9 | تدفّق المشروع نهاية-لنهاية | ⏳ |
| G-P4-10 | تكامل i18n | ⏳ |

---

## يوميات القرارات

### 2026-09-04 · جلسة 1

- **اختيار أداة migrations:** `node-pg-migrate` (MIT). المبرّران: يقبل SQL
  خاماً كاملاً (RLS+FORCE+سياسات SQL خاص بـPG) · ضمن نظام pnpm بلا ثنائي
  خارجي. بدائل مرفوضة (Atlas تصريحي، dbmate خارج pnpm، Prisma يحجب SQL).
  التوثيق في `ATTRIBUTIONS.md §mk-api`.
- **مستخدما القاعدة:** رفض القرار الأوّلي بثلاثة/أربعة مستخدمين. الاتفاق
  على اثنين فقط. القاعدة الحاكمة أعلاه سُجّلت وأُضيفت إلى G-P4-1.
- **بيئة docker:** VM جديدة `colima-mediakit` (4 CPU/8GB/80GB) عبر
  `colima start mediakit`. معزولة عن `~/Minhaj` و `~/PrimeMind`.
- **A1 مكتمل:** infra/docker-compose.yml + init/01-roles.sql +
  packages/db (node-pg-migrate + wrapper) + PHASES-api.md + ATTRIBUTIONS.md.
- **A4 مكتمل + G-P4-1 PASSED:** `packages/db/scripts/verify-isolation.mjs`
  ينفّذ في 1.40s على قاعدة test. كل الفحوص خضراء على 16 جدولاً:
  * وجود على 15 جدولاً تحت مستأجر + tenants الخاص.
  * ثبات: 100 استدعاء متطابق لكل جدول (1500 استعلام إجمالاً).
  * سلبيّة بـID: SELECT/UPDATE/DELETE بـID مستأجر آخر → 0 صفوف/متأثّرات.
  * سلبيّة INSERT: INSERT بـtenant_id=B من جلسة A → RLS rejected (42501).
  * **سلبي حاسم بلا SET LOCAL:** 16 جدولاً → 0 صفوف مرئية.
  * **ANY_TENANT + FORCE على 15 جدولاً:** بتعطيل FORCE مؤقتاً على كل
    جدول، migration_user (OWNER) يرى 2 صفوف (كل مستأجر)، مع FORCE يرى
    1 (tenant_A فقط). فحصان في آلية واحدة (L-46 صريحاً):
    - ANY_TENANT: 2 صفوف بلا FORCE = القاعدة ليست فارغة، فالصفر في
      الفحوص السلبيّة نتاج RLS لا قاعدة خالية.
    - FORCE ضرورية: with=1 vs without=2 = FORCE يمنع تجاوز OWNER.
  * **revisions-orphan:** حذف brand_kit يُبقي revision يتيمة (بلا مورد).
    السياسة تفحص tenant_id مباشرة (لا انتساب عبر resource_id)، لذا
    المراجعة تبقى مرئية لصاحبها، محجوبة عن الآخر، وDELETE منه = 0.
  * لا دور بـBYPASSRLS في القاعدة (postgres تنازل عنه رمزياً).
  * لا SUPERUSER يمكن تسجيل دخول من التطبيق (postgres مستثنى — bootstrap
    فقط، لا يمرّ عبر إعداد التطبيق).
  * كل الـ16 جدولاً: rls=t force=t policies≥1.
  * **اكتُشِف بگ في السياسات القديمة:** custom GUCs تعود إلى empty string
    بعد SET LOCAL على اتصال Pool مُعاد استعماله (لا NULL). أُصلح في
    `20260904141300_fix-empty-string-guc.ts` عبر NULLIF على كل السياسات.
- **signed URLs — القاعدة الثانية (2026-09-04):** أُضيفت كقاعدة حاكمة
  في §القاعدة الثانية أعلاه. لا تُبنى الآن؛ موضعها A11 (assets endpoints)
  + A18 (renders output) + مغلَّف واحد `apps/api/src/storage/signed-url.ts`.
  G-P4-11 تُفعَّل مع A11.
- **A8+ hardening (2026-09-04، بعد ملاحظات المالك):**
  * **إغلاق ثغرة `login_attempts`:** كان app_user يستطيع SELECT مباشراً،
    فيرى محاولات دخول مستأجرين آخرين (email + IP + user_id). الحل:
    - REVOKE SELECT من app_user (يبقى INSERT للتسجيل)
    - GRANT SELECT إلى auth_lookup
    - SECURITY DEFINER ثانية `count_failed_login_attempts(email,ip,since)`
      تعيد عددين فقط — session.ts checkLoginRateLimit يستعملها بدل
      SELECT المباشر
    - G-P4-1 يفحص: app_user grants=[INSERT]، SELECT مباشر → 42501
  * **SMTP guard في production:** config.ts يفشل التشغيل إن كان
    NODE_ENV=production بلا SMTP_HOST/PORT/USER/PASS/FROM. الرسائل
    تصل عبر Emailer الجديد (`src/emailer.ts`) — DevConsole في dev،
    SMTP stub في prod (بند لاحق: تكامل nodemailer).
  * §القاعدة الثالثة أُعيدت صياغتها: دالتا SECURITY DEFINER لا واحدة،
    كلتاهما ضمن نفس حدّ الثقة (auth_lookup) وكلتاهما تعيد اختزالاً.
- **A8 مكتمل + G-P4-2 PASSED:** `apps/api/scripts/verify-auth.mjs`
  (يُشغَّل عبر `pnpm verify:auth`). أربع طبقات، كلها خضراء:
  * **Layer 1 grep guard:** لا ملف في apps/api/src/** (عدا auth/session.ts)
    يستورد @node-rs/argon2 · jose · jsonwebtoken · argon2.
  * **Layer 2 HTTP integration (fastify.inject):**
    - signup 201 مع { user, tenant, session } كامل
    - login صحيح 200، refresh 200 + old refresh مُبطل 401
    - logout 204، logout بجلسة مُبطلة 401 SESSION_REVOKED
    - logout بلا Bearer 401 UNAUTHORIZED
    - logout بتوقيع مُلفَّق 401 TOKEN_INVALID
    - logout بـtoken منتهٍ 401 TOKEN_EXPIRED
  * **Layer 3 non-disclosure:** بريد موجود + مفقود يعطيان نفس status
    (401)، نفس error code (INVALID_CREDENTIALS)، وتوقيت متقارب (1.02×).
    forgot-password يعيد 204 لكلا الحالتين.
  * **Layer 4 rate limit:** يضرب في المحاولة 11 → 429 TOO_MANY_ATTEMPTS.
- **A7 مكتمل — Fastify + hooks + routes:**
  * `apps/api/src/server.ts`: Fastify 5 + helmet + cors + rate-limit عام
    (300/دقيقة) + errorHandler موحّد (docs/16 §1.4).
  * `plugins/auth-guard.ts`: `fastify.authenticated` preHandler واحد
    يجمع (JWT verify → session check → BEGIN + SET LOCAL app.tenant_id
    → set req.auth + req.dbClient). **قرار المالك:** لا استعلام يجري
    خارج hook مرّت به. أيّ استعلام عبر pool.query مباشرة من handler
    مصادَق سيفشل بـRLS (0 صفوف).
  * `plugins/tenant-tx.ts`: onResponse يعمل COMMIT + release، onError
    يعمل ROLLBACK + release. re-entry guard (متغيّر محلّي قبل تصفير
    req.dbClient).
  * `routes/health.ts` + `routes/auth/{signup,login,refresh,logout,forgot-password,reset-password}.ts`.
  * HTTP integration smoke: signup 201، logout بـtoken 204، logout بجلسة
    مُبطلة 401 SESSION_REVOKED، logout بـtoken تالف 401 TOKEN_INVALID.
- **A6 مكتمل — apps/api + auth/session.ts:** الطبقة الوحيدة للمصادقة
  في `apps/api/src/auth/session.ts` (المرجع الوحيد لـjose و @node-rs/argon2
  — G-P4-2 grep guard). القيود المطبَّقة:
  * argon2id بمعاملات صريحة (m=19456 KiB · t=2 · p=1) — مخرج PHC معياري
    `$argon2id$v=19$m=19456,t=2,p=1$SALT$HASH` يقبله Keycloak استيراداً.
  * JWT بـHS256 صريح (jose): iss='pf-mediakit-api'، aud='pf-mediakit-studio'،
    exp 15 دقيقة، session_id ضمن claims. verify يفرض الخوارزمية صراحةً
    (لا يقبل ما في header) + iss + aud + exp.
  * Sessions قابلة للإبطال في القاعدة: getActiveSession يفحص revoked_at
    + expires_at قبل كل طلب.
  * Refresh token: `${tenantId}.${base64url(32 bytes)}` — يحمل tenant_id
    ليتمكّن الخادم من SET LOCAL قبل البحث بـhash (بديل SECURITY DEFINER
    ثانية — مرفوض). rotation صارمة: القديم يُبطل فوراً عند refresh.
  * Rate limit في checkLoginRateLimit: 10 محاولات فاشلة/بريد/15 دقيقة
    · 30/IP/15 دقيقة. login_attempts INSERT خارج txn (لا يُروجع مع الفشل).
  * Constant-time: verifyPassword عبر argon2id timing-safe + fake hash
    وهمي عند البريد المفقود (زمن استجابة متطابق: 14ms vs 27ms في smoke).
  * password reset: رمز عشوائي 32 بايت، ينتهي خلال ساعة، يُستخدم مرة،
    revoke كل الجلسات النشطة عند نجاح الاستعادة.
  * لا كشف وجود الحساب: request-reset يعيد null (نجاح وهمي) للبريد المفقود؛
    complete-reset يعيد نفس ResetTokenInvalid لأيّ سبب فشل.
  * سلوك signup: يولّد UUIDs كودياً بدل RETURNING (سياسة SELECT ترفض
    قراءة الصف الجديد قبل SET LOCAL).
  * apps/api/scripts/smoke-auth.ts يمرّ 22+ فحصاً: PHC + signup + JWT verify
    + login صحيح/خاطئ/مفقود + refresh + revoke + password reset flow +
    rate limit (يضرب عند المحاولة 11).
- **A5 مكتمل + G-P4-1 موسَّع:** migration `20260904141400_auth-schema.ts`:
  * `users`: UNIQUE(email) عالمياً + is_active + last_login_at.
  * `password_reset_tokens` (RLS+FORCE): رمز واحد نشط لكل مستخدم.
  * `login_attempts` (الاستثناء الوحيد بلا RLS، موثَّق): user_id قبل
    email — يقلّل تعداد الحسابات من السجل نفسه. GRANT INSERT+SELECT
    فقط لـapp_user (لا DELETE ولا UPDATE).
  * `auth_lookup` (NOLOGIN NOSUPERUSER NOBYPASSRLS): سياسة SELECT-فقط
    على `users`، USAGE+CREATE على schema public (لملكية الدالة).
  * `find_user_by_email(citext)` SECURITY DEFINER: يعيد
    (user_id, tenant_id, role, password_hash, is_active) — لا PII.
    `SET search_path = pg_catalog, public`. **الوحيدة في المنظومة**
    (§القاعدة الثالثة).
  * G-P4-1 يفحص 17 جدولاً + login_attempts استثناء حصريّ + auth_lookup
    خصائصه وصلاحياته + find_user_by_email positive/negative/cross-tenant.
- **قاعدة SECURITY DEFINER الوحيد (§القاعدة الثالثة):** أيّ طلب لإضافة
  دالة ثانية يمرّ بموافقة المالك. الأثر: كل مسار بديل (session pool،
  cross-tenant lookup لأيّ سبب) يُطرح أوّلاً كسؤال، لا يُبنى صامتاً.
- **بند العضوية الجمعية مؤجَّل (§البند المؤجَّل أعلاه):** يُفعَّل بشرط
  ظهور أوّل مستخدم يحتاجه فعلياً. في A5-A8 الجلسة single-tenant.
- **A3 مكتمل:** `app_set_tenant(uuid)` SQL function (GRANT EXECUTE على
  app_user و migration_user، REVOKE من PUBLIC). helpers TS في
  `packages/db/src/test-helpers.ts` — `withTenant(pool, id, fn)` و
  `withoutTenant(pool, fn)` تُستهلَك من scripts/verify والاختبارات.
  **signed URLs توثيق مبدئي:** مسارات renders/assets تُبنى بانتهاء
  صلاحية في A11/A18 — لا معرّفات متسلسلة قابلة للتخمين.
- **A2 مكتمل:** 16 جدولاً في migration واحدة `20260904141100_initial-schema-and-rls.ts`
  + init/02-extensions.sql (pgcrypto+citext كـsuperuser، لا CREATE على
  migration_user). سياسة `tenants` استثنائية: INSERT مفتوح للـsignup،
  SELECT/UPDATE/DELETE مقيّد بـid = app.tenant_id. باقي الجداول سياسة
  ALL موحّدة `tenant_id = current_setting('app.tenant_id', true)::uuid`
  مع WITH CHECK. templates.tenant_id NULLABLE لدعم globals لاحقاً (A13)،
  حالياً RLS يحجب globals حتى تُضاف سياسة قراءة صريحة. Trigger عام
  `set_updated_at()` مطبَّق. تحقّق يدوي: alpha يرى Alpha فقط، beta يرى
  Beta فقط، بلا SET LOCAL لا شيء.

---

## أوامر التشغيل

**قاعدة قبل كل أمر:** الصدفة الجديدة لا ترث nvm. كل أمر يبدأ بتفعيل
البيئة الصحيحة:

```bash
source ~/.nvm/nvm.sh && nvm use   # يقرأ .nvmrc → node 20.18.1 + pnpm 9.15.4
```

**لا `npm install -g pnpm`** — يربطه بـHomebrew Node 26 ويكسر عزل النسخة
المثبَّت في `.nvmrc` و`packageManager`. pnpm يأتي داخل نسخة nvm عبر corepack.

```bash
# من جذر ~/MediaKit/pf-mediakit-api (بعد nvm use):
pnpm db:up            # يرفع dev + test postgres
pnpm db:down          # يوقف بلا حذف بيانات
pnpm db:reset         # يحذف حجوم البيانات ثم يعيد الرفع (dev فقط)
pnpm db:logs          # يتابع سجلات الحاويتين
pnpm db:migrate       # يشغّل migrations على dev
pnpm db:migrate:test  # يشغّل migrations على test
```
