/**
 * تصحيح definition_hash لقالب breaking — دَينٌ من التزام 422be32.
 *
 * ── السبب المباشر ────────────────────────────────
 * التزام `422be32` («fix(db): manifest breaking.json hash عن aa6ade2») حدَّث
 * `packages/db/template-hashes.json` بالـhash الجديد لـbreaking.json (بعد
 * تعديل opacity في `aa6ade2` · 99-SCRIM-CONTRAST) لكنّه **لم يكتب مهاجرة**
 * تُحدِّث DB. النتيجة:
 *   ملفّ breaking.json canonical hash = 3048949baea03d92d176b04680e79560911bd6a637fec1e4a53f3134a7ad7fc9
 *   DB definition_hash (بعد مهاجرة 20260913000000) = 33757216713783b67077b46e5300c32d8982a3415b9a4eb0916e3346d61080d3
 *   check-template-sync الحيّ (بعد توسيع mk-ci بحاوية pg · 110): يفشل بحقّ.
 *
 * ── لماذا مهاجرة ثالثة على نفس الجدول ─────────────
 * المهاجرة 20260913000000 كتبت hash القديم كـliteral. تعديله في تلك المهاجرة
 * لا يُعيد التطبيق على قواعد مُهيَّأة. الحلّ الوحيد: مهاجرة جديدة.
 *
 * ── التحقّق الخاصّ بهذه المهاجرة (لا boilerplate · L-231) ────
 * الغرض: **قالبٌ واحد بعينه (breaking) يجب أن يحمل hash معلوماً بعينه**.
 * فحصان مستقلّان:
 *   (أ) الصفّ موجود — SELECT COUNT = 1. غياب الصفّ عطبٌ سبق (seed مفقود).
 *   (ب) الـhash المحفوظ = الـhash المُتوقَّع بالضبط. UPDATE فشل أو WHERE لم
 *       يطابق (مثلاً hash القديم اختلف) ⇒ الحالة النهائيّة لا تطابق ⇒
 *       RAISE EXCEPTION ⇒ الهجرة لا تُسجَّل.
 *
 * عدّاد الصفوف المُحدَّثة عمداً غير مذكور — UPDATE=0 قد يكون idempotent
 * (الحالة صحيحة أصلاً) أو كارثيّاً (WHERE لا يُطابق شيئاً). المؤشّر الوحيد
 * الصادق هو **الحالة النهائيّة**.
 */
import type { MigrationBuilder } from 'node-pg-migrate';

export const shorthands = undefined;

const BREAKING_REF = '@pf-mediakit/templates/breaking.json';
const BREAKING_HASH_NEW = '3048949baea03d92d176b04680e79560911bd6a637fec1e4a53f3134a7ad7fc9';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // (١) UPDATE — يُطابق بغضّ النظر عن الـhash القديم (idempotent · آمن حتّى
  // إن hash القديم يوماً اختلف عن 337572...). العمود الوحيد الحاكم:
  // scope='global' AND source_ref=<ref>. الشرط `<> new_hash` يمنع كتابة
  // بلا-تغيير (لا write amplification).
  pgm.sql(`
    UPDATE templates
    SET definition_hash = '${BREAKING_HASH_NEW}'
    WHERE scope = 'global'
      AND source_ref = '${BREAKING_REF}'
      AND definition_hash <> '${BREAKING_HASH_NEW}'
  `);

  // (٢) VERIFY خاصّ — الغرض: قالب breaking بعينه بـhash معلوم بعينه.
  //     (أ) صفّ واحد بالضبط لهذا source_ref في scope=global.
  //     (ب) الـhash المحفوظ = المُتوقَّع بالضبط.
  //     أيّ فشل ⇒ RAISE EXCEPTION ⇒ tx rollback ⇒ الهجرة لا تُسجَّل.
  pgm.sql(`
    DO $$
    DECLARE
      row_count int;
      current_hash text;
    BEGIN
      SELECT count(*) INTO row_count
      FROM templates
      WHERE scope = 'global' AND source_ref = '${BREAKING_REF}';

      IF row_count = 0 THEN
        RAISE EXCEPTION E'BREAKING_HASH_FIX_FAILED: صفّ breaking غائب من templates (scope=global). seed مفقود · هذه المهاجرة تفترض وجوده.';
      END IF;

      IF row_count > 1 THEN
        RAISE EXCEPTION E'BREAKING_HASH_FIX_FAILED: % صفوف لـbreaking في scope=global · متوقَّع صفّ واحد. تكرار غير متوقَّع.', row_count;
      END IF;

      SELECT definition_hash INTO current_hash
      FROM templates
      WHERE scope = 'global' AND source_ref = '${BREAKING_REF}';

      IF current_hash <> '${BREAKING_HASH_NEW}' THEN
        RAISE EXCEPTION E'BREAKING_HASH_FIX_FAILED: hash لا يطابق بعد UPDATE.\\n  متوقَّع: %\\n  محفوظ:  %',
          '${BREAKING_HASH_NEW}', current_hash;
      END IF;
    END $$
  `);
}

export async function down(_pgm: MigrationBuilder): Promise<void> {
  // لا reverse — الحالة الصحيحة لا تُعاد إلى خاطئة.
}
