#!/usr/bin/env bash
# infra/postgres/init-show/01-roles.sh — أدوار قاعدة الشوروم.
#
# نسخة موازية لـinit/01-roles.sql لكن **بكلمات مرور مولَّدة من البيئة**
# (لا كلمات dev المشتركة). قاعدة _AMEND-SHOWROOM-PORTS §3:
# «أدوار قاعدة الشوروم بكلمات مرورٍ مولَّدةٍ لها وحدها».
#
# البيئة المتوقَّعة (يحقنها docker من .env.show عبر environment: في
# infra/docker-compose.show.yml):
#   MIGRATION_USER_PASSWORD
#   APP_USER_PASSWORD
#   CONTROL_PLANE_USER_PASSWORD
#
# ملاحظة: هذا الملفّ .sh لا .sql — docker-entrypoint-initdb.d يشغّله
# ببيئة postgres. يُشعِل psql داخلياً بـ$POSTGRES_USER وقاعدة
# $POSTGRES_DB (كلاهما مضبوط في compose).
#
# القاعدة الحاكمة تبقى (نسخة من init/01-roles.sql):
#   لا دور بـSUPERUSER ولا بـBYPASSRLS إطلاقاً.
#   G-P4-1 يفحصه صراحةً.

set -euo pipefail

: "${MIGRATION_USER_PASSWORD:?MIGRATION_USER_PASSWORD مطلوب في بيئة postgres}"
: "${APP_USER_PASSWORD:?APP_USER_PASSWORD مطلوب في بيئة postgres}"
: "${CONTROL_PLANE_USER_PASSWORD:?CONTROL_PLANE_USER_PASSWORD مطلوب في بيئة postgres}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- migration_user: يملك الجداول، يُنشئ المخطط، يُدير migrations.
    CREATE ROLE migration_user WITH
        LOGIN
        PASSWORD '${MIGRATION_USER_PASSWORD}'
        NOSUPERUSER
        NOBYPASSRLS
        NOINHERIT
        NOCREATEDB
        NOCREATEROLE;

    -- app_user: الاتصال الوحيد لـmk-api في الإنتاج.
    CREATE ROLE app_user WITH
        LOGIN
        PASSWORD '${APP_USER_PASSWORD}'
        NOSUPERUSER
        NOBYPASSRLS
        NOINHERIT
        NOCREATEDB
        NOCREATEROLE;

    -- منح على القاعدة الحالية.
    DO \$\$
    DECLARE
        dbname text := current_database();
    BEGIN
        EXECUTE format('GRANT CONNECT, TEMPORARY ON DATABASE %I TO migration_user', dbname);
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO app_user', dbname);
    END \$\$;

    -- إغلاق public schema — لا PUBLIC، فقط الاثنان.
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
    GRANT USAGE ON SCHEMA public TO migration_user, app_user;
    GRANT CREATE ON SCHEMA public TO migration_user;

    -- إزالة BYPASSRLS من postgres (رمزيّ — SUPERUSER يتجاوز RLS مطلقاً،
    -- لكن G-P4-1 يفحص pg_roles WHERE rolbypassrls = true).
    ALTER ROLE postgres NOBYPASSRLS;

    -- ═════════════════════════════════════════════════════════════════
    -- auth_lookup — SECURITY DEFINER لـfind_user_by_email (login).
    -- NOLOGIN + NOBYPASSRLS. سياسة SELECT صريحة تُضاف في migration.
    -- ═════════════════════════════════════════════════════════════════
    CREATE ROLE auth_lookup WITH
        NOLOGIN
        NOSUPERUSER
        NOBYPASSRLS
        NOINHERIT
        NOCREATEDB
        NOCREATEROLE;

    GRANT auth_lookup TO migration_user;
    GRANT USAGE, CREATE ON SCHEMA public TO auth_lookup;

    -- ═════════════════════════════════════════════════════════════════
    -- control_plane_user — مستوى التحكّم (A27).
    -- BYPASSRLS ممنوع مطلقاً؛ سياسات control_plane_all على كلّ جدول.
    -- ═════════════════════════════════════════════════════════════════
    CREATE ROLE control_plane_user WITH
        LOGIN
        PASSWORD '${CONTROL_PLANE_USER_PASSWORD}'
        NOSUPERUSER
        NOBYPASSRLS
        NOINHERIT
        NOCREATEDB
        NOCREATEROLE;

    DO \$\$
    DECLARE
        dbname text := current_database();
    BEGIN
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO control_plane_user', dbname);
    END \$\$;

    GRANT USAGE ON SCHEMA public TO control_plane_user;
EOSQL

echo "[init-show] ✓ أدوار الشوروم أُنشئت بكلمات مولَّدة (migration_user, app_user, auth_lookup, control_plane_user)"
