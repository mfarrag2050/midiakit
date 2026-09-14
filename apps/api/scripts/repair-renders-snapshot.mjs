#!/usr/bin/env node
/**
 * 160-SNAPSHOT-REPAIR — أصلِح الماضي · لا تحذف.
 *
 * لكل render حالته 'succeeded' و brand_snapshot ناقص:
 *   (أ) مشروع موجود + brand_kit config موجود ⇒ **أعد كتابة brand_snapshot
 *       من brand_kits.config** (نفس ما يفعله apps/api/src/routes/renders/create.ts:117).
 *   (ب) مفقود المشروع أو الـconfig ⇒ **UPDATE status='invalid' + error_code='RENDER_SNAPSHOT_UNREPAIRABLE'
 *       + error_message='reason'**. الوسم لا المحو.
 *
 * الرقم في المخرَج: كم كانت · كم أُصلح · كم وُسِم invalid.
 *
 * الاستدعاء:
 *   node apps/api/scripts/repair-renders-snapshot.mjs [--dry-run]
 */
import pg from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
// سكربت إصلاح لمرّة · يحتاج رؤية + كتابة أفقيّة على renders. نستعمل
// DATABASE_URL_ADMIN (postgres SUPERUSER) مع SET row_security = off
// لتجاوز RLS المُفروض FORCE على renders. لا يجوز في مسار الإنتاج · هذا
// سكربت إداريّ يُشغَّل بعد نشر migration 20260912010000.
const DB_URL = process.env.DATABASE_URL_ADMIN;
if (!DB_URL) {
  console.error('✗ DATABASE_URL_ADMIN ناقص (سكربت إداريّ · postgres SUPERUSER)');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DB_URL, max: 2 });

async function main() {
  // (1) عدّ قبل
  const before = await pool.query(`
    SELECT count(*) AS n FROM renders
    WHERE status='succeeded'
      AND (brand_snapshot IS NULL OR NOT (brand_snapshot ? 'fonts' AND brand_snapshot ? 'colors'))
  `);
  const totalBefore = Number(before.rows[0].n);
  console.log(`▶ succeeded-incomplete قبل الإصلاح: ${totalBefore}`);

  // (2) اجلب المرشّحين مع تصنيفهم
  const candidates = await pool.query(`
    SELECT r.id AS render_id, r.tenant_id, r.project_id,
           p.id AS project_exists,
           bk.id AS bk_id, bk.config AS bk_config
    FROM renders r
    LEFT JOIN projects p ON p.id = r.project_id
    LEFT JOIN brand_kits bk ON bk.id = p.brand_kit_id
    WHERE r.status='succeeded'
      AND (r.brand_snapshot IS NULL OR NOT (r.brand_snapshot ? 'fonts' AND r.brand_snapshot ? 'colors'))
  `);

  let repaired = 0;
  let markedInvalid = 0;

  for (const row of candidates.rows) {
    const derivable = row.project_exists && row.bk_config;
    if (derivable) {
      if (!DRY_RUN) {
        // نُحاكي create.ts:131 — نضع GUC للـtenant قبل الـtrigger
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query('SET LOCAL row_security = off');
          await c.query('SELECT app_set_tenant($1::uuid)', [row.tenant_id]);
          await c.query(
            `UPDATE renders SET brand_snapshot = $2::jsonb WHERE id = $1`,
            [row.render_id, JSON.stringify(row.bk_config)],
          );
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          console.warn(`  ⚠ تعذّر إصلاح ${row.render_id}: ${e.message}`);
          continue;
        } finally { c.release(); }
      }
      repaired++;
    } else {
      const reason = !row.project_exists ? 'PROJECT_MISSING' : 'BRAND_KIT_CONFIG_MISSING';
      if (!DRY_RUN) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          await c.query('SET LOCAL row_security = off');
          await c.query('SELECT app_set_tenant($1::uuid)', [row.tenant_id]);
          await c.query(
            `UPDATE renders SET status='invalid', error_code='RENDER_SNAPSHOT_UNREPAIRABLE',
                                error_message=$2 WHERE id = $1`,
            [row.render_id, `160-repair: ${reason}`],
          );
          await c.query('COMMIT');
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          console.warn(`  ⚠ تعذّر وسم ${row.render_id}: ${e.message}`);
          continue;
        } finally { c.release(); }
      }
      markedInvalid++;
    }
  }

  // (3) عدّ بعد
  const after = await pool.query(`
    SELECT
      count(*) FILTER (WHERE status='succeeded' AND
                             (brand_snapshot IS NULL OR NOT (brand_snapshot ? 'fonts' AND brand_snapshot ? 'colors'))) AS still_bad,
      count(*) FILTER (WHERE status='invalid' AND error_code='RENDER_SNAPSHOT_UNREPAIRABLE') AS marked
    FROM renders
  `);
  const stillBad = Number(after.rows[0].still_bad);
  const marked = Number(after.rows[0].marked);

  console.log('');
  console.log(`══ النتيجة ══`);
  console.log(`  كانت (succ_incomplete):  ${totalBefore}`);
  console.log(`  أُصلحت (snapshot أُعيد): ${repaired}`);
  console.log(`  وُسِمت invalid:          ${markedInvalid}`);
  console.log(`  بعد: succ_incomplete = ${stillBad} · invalid-وسم = ${marked}`);
  if (DRY_RUN) console.log(`  (dry-run — لا كتابة)`);

  await pool.end();
}

main().catch((e) => { console.error('✗', e); process.exit(1); });
