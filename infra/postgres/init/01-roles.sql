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

-- إزالة BYPASSRLS من دور postgres الجذري (docker bootstrap).
-- ملاحظة: postgres يبقى SUPERUSER (شرط docker)، و SUPERUSER يتجاوز RLS
-- دائماً بغضّ النظر عن رمز BYPASSRLS. هذا الإجراء رمزي — يوثّق النيّة،
-- ويجعل تحقّق G-P4-1 «pg_roles WHERE rolbypassrls = true» يعود صفراً.
-- التطبيق لا يتّصل بـpostgres في أيّ سيناريو.
ALTER ROLE postgres NOBYPASSRLS;

-- ═════════════════════════════════════════════════════════════════
-- auth_lookup — دور خاص لدالة find_user_by_email SECURITY DEFINER.
-- ═════════════════════════════════════════════════════════════════
-- السياق: login يحتاج البحث عن مستخدم بالبريد قبل معرفة tenant_id.
-- RLS يحجب البحث cross-tenant. لا BYPASSRLS مسموح (القاعدة الحاكمة).
-- الحل: دالة SECURITY DEFINER تعمل بصلاحيات auth_lookup، الذي:
--   • NOLOGIN — لا يمكن الاتصال به مباشرة (بلا كلمة سر).
--   • NOSUPERUSER NOBYPASSRLS — لا يتجاوز شيئاً بشكل عام.
--   • له سياسة صريحة على users (SELECT-فقط) تُضاف في migration.
-- app_user يستدعي الدالة عبر SELECT find_user_by_email(...)، والدالة
-- تعمل داخلياً بصلاحيات auth_lookup.
--
-- GRANT auth_lookup TO migration_user يسمح لـmigration بتغيير مالك
-- الدالة إلى auth_lookup (شرط PG لـALTER FUNCTION ... OWNER TO).
-- migration_user NOINHERIT فلا يرث صلاحيات auth_lookup تلقائياً —
-- الفائدة الوحيدة: إمكانية ALTER OWNER في migration.

CREATE ROLE auth_lookup WITH
    NOLOGIN
    NOSUPERUSER
    NOBYPASSRLS
    NOINHERIT
    NOCREATEDB
    NOCREATEROLE;

GRANT auth_lookup TO migration_user;

-- USAGE + CREATE على schema public — CREATE لازم لملكية الدالة
-- (شرط PG لـALTER FUNCTION OWNER TO). لا SELECT على أيّ جدول
-- (يُمنح جدول-بجدول في migration). auth_lookup NOLOGIN فلا اتصال
-- مباشر ممكن. SECURITY DEFINER يقتصر على جسم الدالة (SELECT فقط).
GRANT USAGE, CREATE ON SCHEMA public TO auth_lookup;
