# @pf-mediakit/db

Migrations وschema لقاعدة PostgreSQL. تُشغَّل بمستخدم `migration_user`
منفصل عن مستخدم التطبيق `app_user`.

## أوّل تشغيل — الترتيب المُعلَن

**`bootstrap` → `migrate` → `seed`** — بهذا الترتيب، دائماً.

```bash
# من جذر المستودع:
pnpm db:up               # يرفع dev + test postgres في colima-mediakit
pnpm db:bootstrap        # 1. أدوار + امتدادات (100-DB-BOOTSTRAP)
pnpm db:bootstrap:test   #    نفسه على قاعدة الاختبار
pnpm db:migrate          # 2. مخطّط + policies + seed (28 هجرة)
pnpm db:migrate:test     #    نفسه على قاعدة الاختبار
# 3. seed تطبيقيّ (tenants, users): عبر verify:* أو signup في dev
```

## bootstrap — لماذا خطوة منفصلة؟ (100-DB-BOOTSTRAP)

على الميني، الأدوار (`app_user` · `auth_lookup` · `control_plane_user`)
والامتدادات (`citext` · `pgcrypto`) تُنشأ كأثر جانبيّ لخطّاف
docker-compose عند تهيئة الحاوية أوّل مرّة. **الميني يحمل ذاكرتنا فلا
يكشف ما نسيناه.** أيّ بيئة نظيفة (CI · إنتاج · قاعدة مستأجر جديدة) تبدأ
بلا تلك الذاكرة.

`pnpm db:bootstrap` يُنفّذ `infra/postgres/init/01-roles.sql` +
`02-extensions.sql` **كاملَين** على قاعدة فارغة — **مصدر SQL واحد**، لا
نسخ إلى مكان ثانٍ. قابل لإعادة التشغيل (DO blocks شرطيّة + `IF NOT EXISTS`) —
لا يكسر قاعدةً مُهيَّأة.

**`db:migrate` يفشل بصوت** إن غابت التهيئة (رمز خروج 5 مع رسالة تسمّي
الأدوار الغائبة والعلاج). لا انتظار حتى تنفجر الهجرة الخامسة عشرة برسالة
غامضة.

**الاتّصال:** يستعمل `DATABASE_URL_ADMIN` (SUPERUSER) إن مُقدَّم، وإلّا
يستنبطه من `DATABASE_URL` بمستخدم `postgres`.

## القاعدة الحاكمة — لا BYPASSRLS إطلاقاً

`migration_user` و `app_user` كلاهما `NOSUPERUSER NOBYPASSRLS`. الفصل
مضمون في `infra/postgres/init/01-roles.sql` وتُختبَر في G-P4-1
(`scripts/verify-tenant-isolation.mjs`). أيّ حاجة تبدو تستدعي تجاوزاً
هي مؤشر سياسة ناقصة — عالجها بسياسة، وإن تعذّر توقّف واسأل. راجع
`docs/02 §ADR-011` و `PHASES-api.md §القاعدة الحاكمة`.

## بنية Migrations

`migrations/*.ts` — كل ملف بطابع زمني مسبَّق. `.pgmigraterc.json` يوجّه
node-pg-migrate. يُشغَّل داخل معاملة واحدة (single-transaction) — إن
فشل الترحيل، لا أثر جزئي.

## البيئة

`.env.example` نموذج. انسخه إلى `.env` (لا يُتَتبَّع). الأسرار الحقيقية
للإنتاج خارج المستودع (مدير أسرار منفصل).
