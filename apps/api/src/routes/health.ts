/**
 * GET /v1/health — فحص سريع + إعلان الشجرة (260-SERVER-DECLARES-ITSELF).
 *
 * الحقول (بعد 260):
 *   • status, ts — كما كانت (backward-compat).
 *   • commit — SHA للـcommit المشتقّ من `git rev-parse HEAD` على CWD عند
 *     الإقلاع. `null` إن كانت الشجرة بلا git (نسخة /tmp · حاوية runtime).
 *     **لا يُقرأ من env** (260 §٢ · التحذير الحاكم).
 *   • cwd — process.cwd() — المجلّد الذي انطلق منه الخادم.
 *   • workers — عدد العمّال المتّصلين لكل طابور (من Redis CLIENT LIST عبر
 *     BullMQ Queue.getWorkers · لا من متغيّر ولا نبضة يدويّة).
 *
 * ── لماذا public ────────────────────────
 * probe balancer/kubernetes يضربها كل ثانية · لا تُستثنى من الحراسة إلا لأنّها
 * لا تحمل أيّ عنوان داخليّ (IP · secret · session token · env value).
 * تحمل commit + cwd + counts — أشياء موجودة في الـsource وفي `ps aux`.
 *
 * ── rate-limit ─────────────────────────
 * مستثنى (قرار المالك 2026-09-08 · لا يتغيّر بعد 260).
 *
 * ── L-46 (شرط §٣) ────────────────────
 * تشغيل الخادم من شجرتين مختلفتين على التزامين مختلفين ⇒ حقل `commit`
 * يتغيّر. اختبار الحياة في تقرير 260.
 */
import type { FastifyPluginAsync } from 'fastify';
import { getCommit } from '../lib/commit-info.js';
import { getWorkerCounts } from '../queues/index.js';

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', {
    config: { rateLimit: false },
  }, async () => ({
    status: 'ok',
    ts: new Date().toISOString(),
    commit: getCommit(),
    cwd: process.cwd(),
    workers: await getWorkerCounts(),
  }));
};

export default route;
