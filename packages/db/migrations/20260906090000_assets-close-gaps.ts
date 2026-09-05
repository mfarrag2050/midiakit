/**
 * A11 — إغلاق الفجوات الأربع في جدول assets مقابل docs/16 §9.
 *
 * الجدول أُنشئ في A2 بأعمدة أساسية. §9.1/§9.2/§9.3 تُلزم بستّة أعمدة
 * إضافية لم تكن قد بُنيت وقت A2:
 *
 *   - filename      text  — اسم الملف الأصلي (§9.1، ولـfilter[label])
 *   - size_bytes    bigint — حجم الملف (§9.1 pre-check، §9.3 filter)
 *   - content_type  text  — MIME (§9.1 تحقّق قبل الرفع)
 *   - ack_by        uuid  — من أقرّ الترخيص (§9.2)
 *   - ack_at        timestamptz — متى أُقرَّ (§9.2)
 *   - warnings      jsonb — [{code,message}] (§9.2 SVG_HAS_TEXT وغيرها)
 *
 * دلالة NULL في هذه الأعمدة (L-62 — التفرّد مقصود للفارغ أم لا؟):
 *   جميعها nullable لأن الصف يبدأ بـdraft (finalized_at IS NULL) بلا
 *   metadata كامل. تُملأ في §9.2 finalize. لا UNIQUE على أيّ منها —
 *   ملف واحد قد يُرفع مرّات، وسيرَه storage_key الذي يحمل الفرادة
 *   منطقياً (المُنشأ في نمط `<tenantId>/<uuid>/<filename>`).
 *
 * dev/test فارغان — لا هجرة data. NOT NULL لن يُضاف الآن لتفادي
 * كسر أي صف قديم في بيئات مستقبلية غير مرصودة.
 *
 * ack_by: FK إلى users(id) ON DELETE SET NULL — إن حُذف المستخدم،
 * السجلّ يبقى مع فقدان الإسناد (سلوك ADR-014 للمراجعة). لا يمنع الحذف.
 *
 * warnings: عمود مستقلّ لا مفتاح داخل metadata — العقد §9.2 يعرضه
 * كمفتاح top-level في الاستجابة، والقارئ يتوقّعه هناك. مفتاح داخل
 * metadata يخلط دلالتين (البيانات الوصفية عن الأصل vs ملاحظات معالجة
 * وقت finalize). العمود أنظف عند القراءة والفلترة.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    ALTER TABLE assets
      ADD COLUMN filename     text,
      ADD COLUMN size_bytes   bigint,
      ADD COLUMN content_type text,
      ADD COLUMN ack_by       uuid REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN ack_at       timestamptz,
      ADD COLUMN warnings     jsonb
  `);

  // فهرس مساعد للفلترة على filter[label] (§9.3 substring على filename)
  pgm.sql(`CREATE INDEX assets_filename_idx ON assets(tenant_id, filename)`);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP INDEX IF EXISTS assets_filename_idx`);
  pgm.sql(`
    ALTER TABLE assets
      DROP COLUMN IF EXISTS warnings,
      DROP COLUMN IF EXISTS ack_at,
      DROP COLUMN IF EXISTS ack_by,
      DROP COLUMN IF EXISTS content_type,
      DROP COLUMN IF EXISTS size_bytes,
      DROP COLUMN IF EXISTS filename
  `);
}
