/**
 * error-handler — يحوّل ApiError إلى استجابة docs/16 §1.4 موحّدة.
 * أخطاء zod → 400 VALIDATION_FAILED مع field.
 * أخرى → 500 INTERNAL_ERROR (يُسجَّل).
 */
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { ApiError } from '../errors.js';

const plugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((err, req, reply) => {
    const requestId = req.id;

    if (err instanceof ApiError) {
      // 317-A-REFUSAL-THAT-LEAVES-NO-TRACE · سطر تشخيص بمستوى warn لكل ApiError
      // **إلّا 404 NOT_FOUND** (ضجيج bots/typos · اقتراح في تقرير 317 §٤).
      // نُخرج: code · httpStatus · field · requestId · causeCode · causeMsg (مقصوصة).
      // **لا نُخرج**: err.stack كاملاً · req.body · req.headers.authorization ·
      // ولا أيّ محتوى token/secret. cause من jose لا يحمل payload المُوقَّع.
      if (err.code !== 'NOT_FOUND') {
        const cause = (err as { cause?: unknown }).cause;
        const causeCode = cause && typeof cause === 'object' && 'code' in cause
          ? (cause as { code: unknown }).code
          : undefined;
        const causeMsg = cause instanceof Error
          ? cause.message.slice(0, 200)
          : undefined;
        req.log.warn({
          code: err.code,
          httpStatus: err.httpStatus,
          field: err.field,
          requestId,
          ...(causeCode !== undefined ? { causeCode } : {}),
          ...(causeMsg !== undefined ? { causeMsg } : {}),
        }, 'api error');
      }
      reply.status(err.httpStatus).send(err.toBody(requestId));
      return;
    }

    if (err instanceof ZodError) {
      const first = err.issues[0];
      reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'errors.VALIDATION_FAILED',
          field: first?.path.join('.') ?? null,
          requestId,
        },
      });
      return;
    }

    // Fastify-native validation errors (schema)
    if ((err as any).statusCode === 400 && (err as any).validation) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'errors.VALIDATION_FAILED',
          field: (err as any).validation[0]?.instancePath?.replace(/^\//, '') ?? null,
          requestId,
        },
      });
      return;
    }

    // 160-SNAPSHOT-REPAIR — trigger renders_snapshot_guard يرمي بـSQLSTATE
    // 54K01 حين status='succeeded' + snapshot ناقص. نترجم إلى 422 مسمّى.
    if ((err as { code?: string }).code === '54K01') {
      reply.status(422).send({
        error: {
          code: 'RENDER_SNAPSHOT_INCOMPLETE',
          message: 'errors.RENDER_SNAPSHOT_INCOMPLETE',
          field: 'brand_snapshot',
          requestId,
        },
      });
      return;
    }

    req.log.error({ err, requestId }, 'unhandled error');
    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'errors.INTERNAL_ERROR',
        field: null,
        requestId,
      },
    });
  });
};

export default fp(plugin, { name: 'error-handler' });
