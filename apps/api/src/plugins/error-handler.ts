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
