-- تُشغَّل مرة واحدة عند تهيئة الحاوية بمستخدم postgres الجذري (bootstrap).
-- تُنشئ دوريَ التطبيق الوحيدين:
--
--   migration_user  → يملك الجداول، يُنشئ المخطط، يُدير migrations
--   app_user        → الاتصال الوحيد لـmk-api في الإنتاج والاختبار
--
-- قاعدة حاكمة (PHASES-api.md §القاعدة الحاكمة · ADR-011):
--   لا دور بـSUPERUSER ولا بـBYPASSRLS في المنظومة إطلاقاً.
--   G-P4-1 يفحص هذا صراحةً (scripts/verify-tenant-isolation.mjs).
--   أيّ استثناء يبدو ضرورياً هو مؤشر سياسة ناقصة — عالجها بسياسة أو
--   توقّف واسأل.
--
-- كلمات السر التالية للتطوير على المضيف المحلي فقط (127.0.0.1). الإنتاج
-- يستعمل أسراراً منفصلة من مدير أسرار خارج compose.

CREATE ROLE migration_user WITH
    LOGIN
    PASSWORD 'dev_migration_pass'
    NOSUPERUSER
    NOBYPASSRLS
    NOINHERIT
    NOCREATEDB
    NOCREATEROLE;

CREATE ROLE app_user WITH
    LOGIN
    PASSWORD 'dev_app_pass'
    NOSUPERUSER
    NOBYPASSRLS
    NOINHERIT
    NOCREATEDB
    NOCREATEROLE;

-- منح صلاحيات على قاعدة البيانات الحالية (mediakit أو mediakit_test).
DO $$
DECLARE
    dbname text := current_database();
BEGIN
    EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO migration_user', dbname);
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', dbname);
END $$;

-- إعادة صياغة صلاحيات schema public: لا PUBLIC، فقط الاثنان.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO migration_user, app_user;
GRANT CREATE ON SCHEMA public TO migration_user;

-- الصلاحيات الافتراضية: أيّ جدول ينشئه migration_user يمنح app_user
-- SELECT/INSERT/UPDATE/DELETE تلقائياً. app_user لا يمتلك الجداول
-- (شرط RLS مع FORCE أن يكون المتصل غير مالك ولا SUPERUSER ولا BYPASSRLS).
ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;

ALTER DEFAULT PRIVILEGES FOR ROLE migration_user IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO app_user;
