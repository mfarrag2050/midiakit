// 314-A-QUEUE-EACH-TEST-OWNS · isolation setup لكل fork اختبار.
//
// **العلّة** (312 §١ · 314 §١): اختبارات التصدير + observe تشارك real
// api-worker على prefix `pf-mediakit` — العامل يبتلع الـjobs قبل inline
// worker المصطنَع · النتيجة: 7 إخفاقات بينما العامل حيّ · خضراء بلا العامل.
//
// **الحلّ** (314 §٢): كل fork اختبار يملك prefix فريداً في Redis.
//   • `process.env.BULLMQ_PREFIX` = `pf-mediakit-test-<pid>-<ts>`.
//   • config.ts (zod) و apps/renderer/src/queues.ts كلاهما يقرأ الـenv
//     بـdefault `pf-mediakit` — لا مسّ للـproduction path.
//   • setup يشتغل **قبل** imports التست ⇒ الـconst BULLMQ_PREFIX عند
//     تحميل الوحدات = القيمة الفريدة (لا `pf-mediakit`).
//
// **الشرطان** (314 §٢):
//   1. لا مسّ ما يستعمله المنتج — env override فقط · default كما هو.
//   2. تنظيف بعد كل ملفّ — `afterAll` يحذف مفاتيح Redis التي تحمل هذا الـprefix
//      عبر `redis-cli` (لا import ioredis · لأنّ vitest.setup.ts في جذر المستودع
//      حيث لا node_modules workspace-scoped).
import { afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';

// (١) اضبط prefix فريد قبل أيّ import آخر يقرأ الـenv.
const TEST_PREFIX = `pf-mediakit-test-${process.pid}-${Date.now()}`;
process.env.BULLMQ_PREFIX = TEST_PREFIX;

// (٢) تنظيف بعد كل ملفّ اختبار: احذف كل مفاتيح Redis التي تحمل الـprefix.
afterAll(() => {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/3';
  // استخرج db من URL: redis://host:port/db
  const dbMatch = url.match(/\/(\d+)$/);
  const db = dbMatch ? dbMatch[1] : '0';
  try {
    // KEYS ثم DEL عبر redis-cli · مسارٌ خفيف بلا ioredis dependency في الجذر.
    const keys = execFileSync('redis-cli', ['-n', db, 'KEYS', `${TEST_PREFIX}:*`], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
    if (keys) {
      const list = keys.split('\n').filter(Boolean);
      if (list.length > 0) {
        execFileSync('redis-cli', ['-n', db, 'DEL', ...list], {
          stdio: ['ignore', 'ignore', 'ignore'],
          timeout: 5000,
        });
      }
    }
  } catch {
    // Best-effort · تنظيف فاشل لا يفشل الاختبار.
  }
});
