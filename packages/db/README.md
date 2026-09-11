# @pf-mediakit/db

Migrations وschema لقاعدة PostgreSQL. تُشغَّل بمستخدم `migration_user`
منفصل عن مستخدم التطبيق `app_user`.

## أول تشغيل

```bash
# من جذر المستودع:
pnpm db:up          # يرفع dev + test postgres في colima-mediakit
pnpm db:migrate     # يشغّل migrations على dev
pnpm db:migrate:test # يشغّل migrations على test
```

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
