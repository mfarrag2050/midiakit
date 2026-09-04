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

## القاعدة الثالثة (2026-09-04) — SECURITY DEFINER الوحيد

**في المنظومة كلها، هناك دالة SECURITY DEFINER واحدة فقط:
`find_user_by_email(citext)`** (مضافة في A5). أيّ طلب لإضافة ثانية
يمرّ **بموافقة صريحة من المالك**. السبب: كل دالة SECURITY DEFINER
هي ثغرة محتملة في الحاجز الذي بُني بـRLS+FORCE — إن أخطأت في
الملكية أو search_path أو الحقول المُعادة، يتسرّب كل شيء.

القيود على `find_user_by_email` (توثَّق هنا حرفياً لأنها المرجع لأيّ
طلب مستقبلي):
1. **يعيد الحد الأدنى فقط:** user_id, tenant_id, role, password_hash,
   is_active. لا PII (اسم، هاتف، أيّ حقل شخصي). أيّ إضافة تحتاج
   مراجعة.
2. **الاستجابة نفسها لبريد موجود وغير موجود** (بالتوقيت والنصّ) —
   تُفرض في `auth/session.ts` بمقارنة hash وهمي بـargon2 عند الفشل.
3. **الدور المالك `auth_lookup`:** NOLOGIN + NOSUPERUSER + NOBYPASSRLS
   + سياسة SELECT-فقط على `users` فقط (لا صلاحية على أيّ جدول آخر).
4. **`SET search_path = pg_catalog, public`** داخل الدالة — يمنع
   اختطاف المسار.
5. **بعد التحقّق من كلمة السر:** تُجلب باقي البيانات عبر استعلام
   عادي مع SET LOCAL app.tenant_id.

**G-P4-1 يحرس القاعدة:** يتحقّق أن الدالة تعيد الحقول المعلَنة فقط،
وأن `auth_lookup` لا يستطيع SELECT على `brand_kits` أو أيّ جدول آخر.

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
| A8 | **G-P4-2** بوابة نقاء المصادقة | 🔄 التالي | grep guard + HTTP integration + timing + rate limit + non-disclosure |

### المجموعة B–F: endpoints (لاحقاً)

راجع `docs/17 §3.3` — 25 بنداً (A9-A25) لاحقاً بعد اجتياز G-P4-1 و G-P4-2.

---

## البوابات — الحالة

| البوابة | الوصف | الحالة |
|---|---|---|
| **G-P4-1** | عزل المستأجرين على كل جدول (وجود + ثبات + 3 سلبيات + ANY_TENANT + revisions-orphan + لا-BYPASSRLS) | ✅ passed 2026-09-04 |
| G-P4-2 | نقاء المصادقة (تسجيل/دخول/دعوة/إبطال + سلبيّة) | ⏳ بعد A8 |
| **G-P4-11** | signed URLs — لا تسرّب مفاتيح خام في أيّ استجابة | ⏳ تُفعَّل مع A11 |
| G-P4-3 | اكتمال سجل المراجعات | ⏳ |
| G-P4-4 | ثبات `brand_snapshot` | ⏳ |
| G-P4-5 | المفاتيح لا تُعاد | ⏳ |
| G-P4-6 | `licenseAck` إلزامي | ⏳ |
| G-P4-7 | صلاحية Workflow | ⏳ |
| G-P4-8 | استرجاع الحصص | ⏳ |
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
