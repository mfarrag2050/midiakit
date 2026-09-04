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
- G-P4-1 (`scripts/verify-tenant-isolation.mjs`) يضيف فحص **وجود** صريحاً
  (L-46): لا دور في القاعدة يحمل `rolbypassrls = true`. أيّ دور جديد
  ينشأ بلا حرص = فشل البوابة.

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
| **A1** | البنية الأساسية للقاعدة + المستخدمان | 🔄 قيد التنفيذ | docker-compose + init/01-roles + packages/db |
| A2 | المخطط الكامل + RLS+FORCE | ⏳ | migration واحدة لكل الجداول |
| A3 | آلية `SET LOCAL app.tenant_id` | ⏳ | SQL function + test helper |
| A4 | **G-P4-1** بوابة عزل المستأجرين | ⏳ | فحوص وجود + ثبات + سلبيّة على كل جدول |
| A5–A8 | المصادقة (`sessions` + `auth/session.ts` + middleware) | ⏳ | بعد A4 |

### المجموعة B–F: endpoints (لاحقاً)

راجع `docs/17 §3.3` — 25 بنداً (A9-A25) لاحقاً بعد اجتياز G-P4-1 و G-P4-2.

---

## البوابات — الحالة

| البوابة | الوصف | الحالة |
|---|---|---|
| **G-P4-1** | عزل المستأجرين على كل جدول (وجود + ثبات + 3 سلبيات + لا-BYPASSRLS) | ⏳ A4 |
| G-P4-2 | نقاء المصادقة | ⏳ بعد A8 |
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
- **A1 قيد التنفيذ:** infra/docker-compose.yml + init/01-roles.sql +
  packages/db (node-pg-migrate + wrapper) + PHASES-api.md + ATTRIBUTIONS.md.

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
