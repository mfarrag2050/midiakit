/**
 * _AMEND-244-REVISION-SNAPSHOT-SECRETS — تعقيمٌ عند المصدر لا عند القراءة.
 *
 * ── الاكتشاف (250) ─────────────────────────────
 * `log_revision()` trigger على INSERT/UPDATE إلى `users` كان يفعل
 * `to_jsonb(NEW)` · النتيجة snapshot يحمل `password_hash` (argon2 hash
 * كامل نصّاً). 250 عالج التصدير بـsanitize at read time. **لكن الهاش
 * لا يزال يُكتب** الليلة والغد لكلّ مسار قراءة آخر — حاضر أو قادم.
 * والأخطر: `revisions` مقصور بالمستأجر (RLS) ⇒ **المستأجر يستطيع بلوغ
 * هاشات كلمات سرّ مستخدميه** بمسار لم يُصمَّم لذلك.
 *
 * ── البحث عن الصنف (شرط §١) ──────────────────
 * جرَّبتُ pattern موسّع على أسماء الأعمدة:
 *   `column_name ~* '(hash|encrypted|secret|token|_key$|^key$|password|salt)'`
 * كشف 18 عموداً. أدنى تدقيق يفرزها إلى:
 *   • **أسرار حقيقيّة** (5): users.password_hash · ai_integrations.api_key_encrypted
 *     · invitations.token_hash · sessions.refresh_token_hash · platform_sessions.refresh_token_hash.
 *     (+ password_reset_tokens.token_hash · platform_users.password_hash — لكن هذه
 *     الجداول ليست في scope trigger الحاليّ ولا سيكون).
 *   • **إيجابيّات كاذبة** (13): storage_key (مسار S3) · idempotency_key (id عمليّة)
 *     · definition_hash (checksum للـintegrity) · plan.key (identifier) · ai_tokens_in/out
 *     (متريكة) · plan_key.
 * ⇒ القائمة السرّيّة التي نستَبعِدها من snapshot:
 *   `password_hash, api_key_encrypted, api_key_ref, token_hash, refresh_token_hash`
 * (api_key_ref مضاف احتياطاً — الاسم يوحي بمرجع مُخفَّف · لكن ai_integrations لا
 * تفرِّق نصّياً بين ref و encrypted حين تُدرج لاحقاً في scope trigger).
 *
 * ── الحلّ ────────────────────────────────────
 * 1. `log_revision()` يجرِّد snapshot من المفاتيح الخمسة **قبل** INSERT.
 * 2. UPDATE على revisions الموجودة (11372 صفّاً · 3891 يحمل password_hash · 0 للباقين).
 * 3. VERIFY (نمط _AMEND-231): SELECT بعد UPDATE · RAISE EXCEPTION إن بقي أيّ صفّ
 *    يحمل مفتاحاً من القائمة ⇒ الهجرة تُرجَع · لا تُسجَّل مطبَّقة.
 *
 * ── ما يبقى ─────────────────────────────────
 * • sanitize في 250 (`data-export.ts`) يبقى دفاعاً ثانياً — لا يُلمَس.
 * • الأعمدة نفسها في الجداول الأصليّة تبقى (هذه ليست تذكرة كتم users.password_hash
 *   عن users · هي تذكرة كتمه عن revisions.snapshot).
 * • ai_integrations/sessions لا يوجد عليها log_revision trigger اليوم — إن أُضيف
 *   trigger مستقبلاً · القائمة أعلاه ستستَبعد أسرارها تلقائيّاً.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const SECRET_KEYS = [
  'password_hash',
  'api_key_encrypted',
  'api_key_ref',
  'token_hash',
  'refresh_token_hash',
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  // ── (0) سياسة migration_user على revisions — إلزاميّة لـUPDATE + SELECT VERIFY ──
  // بلاها: UPDATE يُصيب 0 rows بصمت (RLS يفرز · لا صفّ يطابق مستأجراً محدَّداً)
  // و VERIFY يرى 0 rows كذلك · فيمرّ زوراً — بينما 3891 هاش لا يزالون في DB.
  // هذا **الصنف** الذي حذّر منه _AMEND-231 · نُطبِّق درسه: policy قبل الكتابة.
  pgm.sql(`DROP POLICY IF EXISTS revisions_migration_user_all ON revisions`);
  pgm.sql(`
    CREATE POLICY revisions_migration_user_all ON revisions
      AS PERMISSIVE FOR ALL TO migration_user
      USING (true) WITH CHECK (true)
  `);

  // ── (1) تعديل log_revision · يجرِّد snapshot قبل INSERT ─────────
  // نُبقي كل السلوك الآخر كما هو (تجاوز DELETE على tenants · EXISTS parent guard ·
  // set_config في create tenant) — الإضافة الوحيدة: `snapshot - key - key ...`
  // على v_snapshot قبل INSERT INTO revisions.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION log_revision() RETURNS trigger AS $$
    DECLARE
      v_actor uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
      v_type  text; v_action text; v_res_id uuid; v_snapshot jsonb; v_tenant uuid;
    BEGIN
      -- 151: DELETE على tenants يُسجَّل في tenant_deletion_log عبر endpoint.
      IF TG_TABLE_NAME = 'tenants' AND TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;

      v_type := CASE TG_TABLE_NAME
        WHEN 'brand_kits' THEN 'brand_kit'
        WHEN 'projects'   THEN 'project'
        WHEN 'templates'  THEN 'template'
        WHEN 'users'      THEN 'user'
        WHEN 'assets'     THEN 'asset'
        WHEN 'tenants'    THEN 'tenant'
        ELSE TG_TABLE_NAME
      END;
      IF TG_OP = 'INSERT' THEN v_action := 'create'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'UPDATE' THEN v_action := 'update'; v_res_id := NEW.id; v_snapshot := to_jsonb(NEW);
      ELSIF TG_OP = 'DELETE' THEN v_action := 'delete'; v_res_id := OLD.id; v_snapshot := to_jsonb(OLD);
      END IF;

      -- _AMEND-244: تجريد snapshot من المفاتيح الحسّاسة قبل الكتابة.
      -- قائمة مسمّاة صراحة — لا تخمين بـLIKE أو regex في PL/pgSQL.
      v_snapshot := v_snapshot
        - 'password_hash'
        - 'api_key_encrypted'
        - 'api_key_ref'
        - 'token_hash'
        - 'refresh_token_hash';

      -- tenant_id resolution + set_config لتجاوز RLS (من 20260907150000):
      IF TG_TABLE_NAME = 'tenants' THEN
        v_tenant := v_res_id;
        PERFORM set_config('app.tenant_id', v_res_id::text, true);
      ELSE
        v_tenant := COALESCE(
          (v_snapshot->>'tenant_id')::uuid,
          NULLIF(current_setting('app.tenant_id', true), '')::uuid
        );
      END IF;

      -- 151: CASCADE يحذف tenant أوّلاً · نتجاوز log إن غاب parent.
      IF NOT EXISTS (SELECT 1 FROM tenants WHERE id = v_tenant) THEN
        RETURN COALESCE(NEW, OLD);
      END IF;

      INSERT INTO revisions(tenant_id, resource_type, resource_id, actor_id, action, snapshot)
      VALUES (v_tenant, v_type, v_res_id, v_actor, v_action, v_snapshot);
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER
  `);

  // ── (2) تنظيف revisions الموجودة ──────────────────────────
  // idempotent: يُرجع 0 rows إن كانت الحالة نظيفة سلفاً.
  pgm.sql(`
    UPDATE revisions
    SET snapshot = snapshot
      - 'password_hash'
      - 'api_key_encrypted'
      - 'api_key_ref'
      - 'token_hash'
      - 'refresh_token_hash'
    WHERE snapshot ?| ARRAY['password_hash', 'api_key_encrypted', 'api_key_ref', 'token_hash', 'refresh_token_hash']
  `);

  // ── (3) VERIFY — نقرأ الحالة النهائيّة · نفشل إن بقي أيّ صفّ يحمل مفتاحاً ──
  // نمط _AMEND-231: RAISE EXCEPTION ⇒ tx rolls back ⇒ migration NOT recorded.
  pgm.sql(`
    DO $$
    DECLARE
      leak_count int;
      leak_row RECORD;
      leak_detail text := '';
    BEGIN
      SELECT count(*) INTO leak_count FROM revisions
      WHERE snapshot ?| ARRAY['password_hash', 'api_key_encrypted', 'api_key_ref', 'token_hash', 'refresh_token_hash'];

      IF leak_count > 0 THEN
        FOR leak_row IN
          SELECT k AS key, count(*)::text AS n
          FROM revisions, unnest(ARRAY['password_hash', 'api_key_encrypted', 'api_key_ref', 'token_hash', 'refresh_token_hash']::text[]) AS k
          WHERE snapshot ? k
          GROUP BY k
        LOOP
          leak_detail := leak_detail || '  ' || leak_row.key || '=' || leak_row.n || chr(10);
        END LOOP;
        RAISE EXCEPTION E'MIGRATION_VERIFY_FAILED: revisions لا تزال تحمل أسراراً · % صفّاً:\\n%',
          leak_count, leak_detail;
      END IF;
    END $$
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  // لا نُعيد `log_revision` إلى نسخة تكتب الأسرار — تلك ثغرة.
  // لكن نُعيده إلى نسخة 20260912000000 (بلا strip) لو كان النطاق يتطلّب.
  // إن كان الاستعادة تعني فعلاً «أعِد الثغرة» · لا. down هو no-op مقصود.
  //
  // ملاحظة: revisions المُنظَّفة سلفاً · لا يمكن إرجاعها (الهاش المفقود لا يُستعاد).
}
