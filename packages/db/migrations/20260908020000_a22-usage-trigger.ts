/**
 * A22 — usage: عمود videos_count + trigger على renders (نمط A20).
 *
 * السياق: قبل A22 كان `usage` جدولاً قائماً بلا كاتب. A21 يعدّ من
 * renders مباشرة (فرض) بينما GET /subscription يقرأ من usage (عرض) —
 * مصدران متباعدان (usage = 0 دائماً، videos.used كاذب).
 *
 * الحلّ (نمط A20 log_revision — قرار المالك 2026-09-08):
 *   - `usage.videos_count` جديد (integer NOT NULL DEFAULT 0)
 *   - trigger على renders يُطلق **حصراً عند انتقال الحالة إلى 'succeeded'**
 *   - INSERT مباشر بـstatus='succeeded' يُطلقه أيضاً (نفس المعنى)
 *   - UPDATE من running/queued → succeeded يُطلقه (تحويلة واحدة، عدّة واحدة)
 *   - UPDATE من succeeded → succeeded (idempotent write) لا يُطلقه (WHEN DISTINCT)
 *   - failed لا يُطلقه (النتيجة السلبية لا تُحسب في الحصص — يطابق A21)
 *   - period = date_trunc('month', now())::date (تقويمي — قرار المالك)
 *   - video_seconds يبقى 0 معلَناً (docs/01 يحدّ بعدد الفيديو لا بثوانيه —
 *     العمود موجود في العقد، سيُملأ في A24 إن ظهرت الحاجة)
 *
 * SECURITY DEFINER لتجاوز RLS على usage (المُشغِّل يعمل باسم مالك الدالة).
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE usage ADD COLUMN videos_count integer NOT NULL DEFAULT 0;

    CREATE OR REPLACE FUNCTION log_render_usage() RETURNS trigger AS $$
    DECLARE
      v_period date := date_trunc('month', now())::date;
      v_videos_delta integer := CASE WHEN NEW.format = 'mp4' THEN 1 ELSE 0 END;
      -- video_seconds يبقى 0 حتى A24 (docs/01 يحدّ بالعدد لا بالثواني).
      -- عمود في العقد بلا مستهلك حالياً، لا يُحذَف.
      v_seconds_delta integer := 0;
    BEGIN
      -- الشرط: التحويلة إلى 'succeeded' حصراً.
      -- INSERT مباشر بـstatus='succeeded' ⇒ OLD غير موجود، الشرط يمرّ.
      -- UPDATE queued→succeeded ⇒ OLD.status != 'succeeded' والشرط يمرّ.
      -- UPDATE succeeded→succeeded ⇒ IS DISTINCT FROM ترفض (لا عدّ مضاعف).
      IF NEW.status <> 'succeeded' THEN RETURN NEW; END IF;
      IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'succeeded' THEN
        RETURN NEW;
      END IF;

      INSERT INTO usage(tenant_id, period, renders_count, videos_count, video_seconds)
      VALUES (NEW.tenant_id, v_period, 1, v_videos_delta, v_seconds_delta)
      ON CONFLICT (tenant_id, period) DO UPDATE SET
        renders_count = usage.renders_count + 1,
        videos_count  = usage.videos_count + EXCLUDED.videos_count,
        video_seconds = usage.video_seconds + EXCLUDED.video_seconds,
        updated_at    = now();

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    -- INSERT AND UPDATE — لتغطية الحالتين: نداء العامل UPDATE، والسكربتات INSERT.
    CREATE TRIGGER renders_log_usage
      AFTER INSERT OR UPDATE OF status ON renders
      FOR EACH ROW EXECUTE FUNCTION log_render_usage();
  `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP TRIGGER IF EXISTS renders_log_usage ON renders;
    DROP FUNCTION IF EXISTS log_render_usage();
    ALTER TABLE usage DROP COLUMN IF EXISTS videos_count;
  `);
}
