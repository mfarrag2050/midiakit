/**
 * tenant-tx — hooks عامّة لإدارة نهاية دورة حياة req.dbClient.
 *
 * 526 · إصلاح سباق «الردّ قبل الالتزام»:
 * -----------------------------------
 * قبل هذا الإصلاح: `COMMIT` كان في `onResponse` (بعد إرسال الاستجابة إلى
 * الـsocket). أثبت 525 أنّ `light-my-request` (وأيّ عميل حقيقيّ) يستقبل
 * الاستجابة قبل تنفيذ `onResponse` — فطلبٌ لاحقٌ مباشر يفتح txn جديدة
 * (BEGIN + SELECT) قبل COMMIT السابق، وsnapshot تحت READ COMMITTED لا
 * يرى INSERT الأخير → 404 NOT_FOUND (verify-a22 §Layer2, verify-brand-kits §9).
 *
 * الإصلاح (526):
 *  (1) `commitTx(req)` صريحٌ في نهاية كلّ handler مُعدِّل قبل reply.send.
 *  (2) حارسٌ مركزيّ في `onSend` يمسك الـroutes المنسيّة: يرمي في الاختبار،
 *      ويلتزم احتياطيّاً في الإنتاج مع log.warn.
 *  (3) `onError` يظلّ يعتني بمسار الاستثناء (ROLLBACK + release).
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';

declare module 'fastify' {
  interface FastifyRequest {
    dbClient?: PoolClient | undefined;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * commitTx — التزام صريح لمعاملة الطلب. يجب استدعاؤه في نهاية كلّ
 * handler مُعدِّل قبل `reply.send` كي يستلم العميل الاستجابة بعد أن يكون
 * الالتزام قد ثبت في الـWAL. آمنٌ للاستدعاء المتكرّر (يفحص الوجود).
 */
export async function commitTx(req: FastifyRequest): Promise<void> {
  const client = req.dbClient;
  if (!client) return;
  req.dbClient = undefined;
  try {
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

const plugin: FastifyPluginAsync = async (fastify) => {
  // (٢) الحارسُ المركزيّ (onSend للـmutating فقط):
  // إن وصل onSend على POST/PUT/PATCH/DELETE وما تزال المعاملةُ مفتوحة،
  // فقد نسي handler استدعاء commitTx. في الاختبار نرمي باسم الـroute،
  // وفي الإنتاج نلتزم احتياطيّاً مع تحذير (لا نُسقط طلب مستخدم).
  //
  // قراءةٌ (GET · HEAD · OPTIONS) لا race فيها: تُترك لـonResponse.
  // وإلّا COMMIT مع بايتاتٍ متدفّقة قد يُربك حال reply لبعض المعالجات.
  fastify.addHook('onSend', async (req, _reply, payload) => {
    const client = req.dbClient;
    if (!client) return payload;
    if (!MUTATING_METHODS.has(req.method)) return payload; // GET وما شابه → onResponse

    const routeId = `${req.method} ${req.routeOptions?.url ?? req.url}`;
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
    if (isTestEnv) {
      req.dbClient = undefined;
      try { await client.query('ROLLBACK').catch(() => {}); } finally { client.release(); }
      throw new Error(
        `[tenant-tx] handler لم يستدعِ commitTx(req) قبل reply.send على route مُعدِّل: ${routeId}. ` +
        `أضف \`await commitTx(req);\` قبل reply.send. 526.`
      );
    }
    // الإنتاج — التزم احتياطيّاً + سجّل تحذيراً باسم الـroute.
    req.log.warn({ route: routeId }, '[tenant-tx] fallback COMMIT: handler forgot commitTx(req)');
    req.dbClient = undefined;
    try { await client.query('COMMIT'); } catch (err) {
      req.log.error({ err, route: routeId }, 'fallback COMMIT failed');
    } finally { client.release(); }
    return payload;
  });

  // (٣) onResponse يعتني بالقراءة (GET) — لا race، الرد أُرسل، COMMIT هنا آمن.
  fastify.addHook('onResponse', async (req, _reply) => {
    const client = req.dbClient;
    if (!client) return;
    req.dbClient = undefined;
    try { await client.query('COMMIT'); }
    catch (err) { req.log.error({ err }, 'COMMIT (onResponse) failed'); }
    finally { client.release(); }
  });

  fastify.addHook('onError', async (req, _reply, _err) => {
    const client = req.dbClient;
    if (!client) return;
    req.dbClient = undefined;
    try {
      await client.query('ROLLBACK').catch(() => {});
    } finally {
      client.release();
    }
  });
};

export default fp(plugin, { name: 'tenant-tx' });
