// 190-EXPORT-E2E §٤ · اختبارات /v1/ready + الفحوصات الفرديّة.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { resolve } from 'node:path';
import { buildServer } from '../server.js';
import { closePool, closePlatformPool, getPool } from '../db.js';
import { closeQueues } from '../queues/index.js';
import { getStorage, type Storage } from '../storage/index.js';
import { checkDb, checkStorage, checkBuiltinFont } from '../health/checks.js';

function J<T = unknown>(r: { body: string }): T | null {
  try { return JSON.parse(r.body) as T; } catch { return null; }
}

let fastify: FastifyInstance;

beforeAll(async () => {
  fastify = await buildServer();
  await fastify.ready();
});

afterAll(async () => {
  await fastify.close();
  await closeQueues();
  await closePool();
  await closePlatformPool();
});

describe('190 §٤ · /v1/ready · endpoint', () => {
  it('حالة صحيّة كاملة ⇒ 200 · كل الفحوصات ok', async () => {
    const r = await fastify.inject({ method: 'GET', url: '/v1/ready' });
    expect(r.statusCode).toBe(200);
    const body = J<{ status: string; checks: { db: string; storage: string; font: string } }>(
      r as { body: string },
    )!;
    expect(body.status).toBe('ok');
    expect(body.checks.db).toBe('ok');
    expect(body.checks.storage).toBe('ok');
    expect(body.checks.font).toBe('ok');
  });

  it('الجسم لا يكشف قيمة سرّ · أسماء الشروط فقط', async () => {
    const r = await fastify.inject({ method: 'GET', url: '/v1/ready' });
    const raw = r.body;
    // كلمات مفتاحيّة قد تسرَّب: password/secret/host/port/user
    expect(raw.toLowerCase()).not.toMatch(/password|secret|:19041|:6379|postgres:\/\//);
  });
});

describe('190 §٤ · فحوصات فرديّة (وحدة)', () => {
  it('checkDb: pool شغّال ⇒ ok', async () => {
    const r = await checkDb(getPool());
    expect(r).toBe('ok');
  });

  it('checkDb: pool مكسور (URL خاطئ) ⇒ fail', async () => {
    const { Pool } = await import('pg');
    const badPool = new Pool({ connectionString: 'postgres://x:y@127.0.0.1:1/n', max: 1, connectionTimeoutMillis: 500 });
    const r = await checkDb(badPool);
    expect(r).toBe('fail');
    await badPool.end().catch(() => {});
  });

  it('checkStorage: adapter شغّال ⇒ ok + probe يُحذَف', async () => {
    const r = await checkStorage(getStorage());
    expect(r).toBe('ok');
  });

  it('checkStorage: adapter يفشل ⇒ fail', async () => {
    const bad: Storage = {
      ...getStorage(),
      putObjectRaw: async () => { throw new Error('simulated'); },
    } as Storage;
    const r = await checkStorage(bad);
    expect(r).toBe('fail');
  });

  it('checkBuiltinFont: assets/fonts موجود ⇒ ok', () => {
    const root = resolve(import.meta.dirname, '..', '..', '..', '..');
    expect(checkBuiltinFont(root)).toBe('ok');
  });

  it('checkBuiltinFont: مسار غير موجود ⇒ fail', () => {
    expect(checkBuiltinFont('/nonexistent/repo')).toBe('fail');
  });
});
