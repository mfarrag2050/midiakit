/**
 * alerts-worker — نقطة تشغيل process منفصل عن api-worker.
 *
 * قرار المالك (ALERTS-WIRE §1): worker منفصل — الخيار (ب). السبب:
 * التنبيه يقيس صحّة النظام (طوابير، عامل معلّق، قرص) — إن كان داخل
 * api-worker فسقوطه يُبقى بلا مُنبِّه. هنا process مستقلّ يستطيع
 * الاستمرار حين ينهار العامل الأصلي، ويُدير كل شيء عبر supervisor
 * خارجي (systemd / pm2 / docker restart).
 *
 * التشغيل:
 *   tsx apps/api/src/limits/alerts-worker.ts
 *   أو `pnpm alerts:worker` (script في apps/api/package.json)
 *
 * env المطلوب:
 *   DATABASE_URL / DATABASE_URL_APP (للـorphan-sweep)
 *   REDIS_URL (افتراضي redis://127.0.0.1:6379/3)
 *   ALERT_WEBHOOK_URL (بدونه: cycle يعمل بلا إشعار خارجي)
 *
 * الإغلاق: SIGTERM / SIGINT ⇒ يوقف worker + queue بلا فقد بيانات.
 */
import pg from 'pg';
import { startAlertsCron } from './alerts-cron.js';

const { Pool } = pg;

async function main() {
  const dbUrl = process.env['DATABASE_URL'] ?? process.env['DATABASE_URL_APP'];
  if (!dbUrl) {
    console.error('[alerts-worker] DATABASE_URL أو DATABASE_URL_APP مطلوب');
    process.exit(2);
  }
  const migPool = new Pool({ connectionString: dbUrl, max: 2 });

  console.log('[alerts-worker] يبدأ · webhook=', process.env['ALERT_WEBHOOK_URL'] ? 'ON' : 'OFF');
  const cron = await startAlertsCron(migPool);
  console.log('[alerts-worker] جاهز · ينتظر repeatable jobs (alert-cycle كل 5 دقائق · orphan-sweep يومياً 03:00)');

  let shuttingDown = false;
  const shutdown = async (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[alerts-worker] ${sig} — إغلاق نظيف`);
    try { await cron.stop(); } catch (e) { console.warn('[alerts-worker] stop:', e); }
    try { await migPool.end(); } catch (e) { console.warn('[alerts-worker] pool.end:', e); }
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[alerts-worker] فشل الإقلاع:', e);
  process.exit(1);
});
