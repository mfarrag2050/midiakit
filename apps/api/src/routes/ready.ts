/**
 * GET /v1/ready (190-EXPORT-E2E §٤) — فحص جاهزيّة للعرض/النشر.
 *
 * 200 إن: db مستجيبة + storage قابل للكتابة + خطّ مضمَّن واحد على الأقلّ.
 * 503 وإلّا · جسم يسمّي أيّ شرط سقط (أسماء فقط · لا قيمة سرّ · لا مسار).
 *
 * public (بلا auth) · مستثنى من rate-limit (LB/kubernetes يضربه دورياً).
 */
import { resolve } from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { getPool } from '../db.js';
import { getStorage } from '../storage/index.js';
import { checkDb, checkStorage, checkBuiltinFont } from '../health/checks.js';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');

const route: FastifyPluginAsync = async (fastify) => {
  fastify.get('/ready', {
    config: { rateLimit: false },
  }, async (_req, reply) => {
    const [db, storage, font] = await Promise.all([
      checkDb(getPool()),
      checkStorage(getStorage()),
      Promise.resolve(checkBuiltinFont(REPO_ROOT)),
    ]);
    const allOk = db === 'ok' && storage === 'ok' && font === 'ok';
    reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'fail',
      checks: { db, storage, font },
    });
  });
};
export default route;
