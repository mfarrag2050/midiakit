// 260-SERVER-DECLARES-ITSELF · /v1/health يعلن الشجرة.
//
// **الاختبار الوحيد المُلزَم**: الحقول الثلاثة موجودة · commit إمّا SHA
// من 40 hex أو null · cwd = process.cwd() · workers = Record<queueName, number>.
//
// **L-46 على تغيّر commit بين شجرتين** يعيش في تقرير 260 · يتطلّب
// worktree ثانياً — خارج نطاق unit test.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { closePool, closePlatformPool } from '../db.js';
import { closeQueues } from '../queues/index.js';

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

describe('260 · /v1/health يعلن الشجرة', () => {
  it('يُرجع status + ts + commit + cwd + workers', async () => {
    const r = await fastify.inject({ method: 'GET', url: '/v1/health' });
    expect(r.statusCode).toBe(200);
    const body = J<{
      status: string; ts: string;
      commit: string | null; cwd: string;
      workers: Record<string, number>;
    }>(r as { body: string })!;

    expect(body.status).toBe('ok');
    expect(typeof body.ts).toBe('string');
    // commit إمّا 40 hex أو null — لا نصّ بشريّ
    expect(body.commit === null || /^[a-f0-9]{40}$/.test(body.commit)).toBe(true);
    // cwd مسار مطلق
    expect(body.cwd).toMatch(/^\//);
    // workers: 4 مفاتيح · قيَم أعداد
    expect(Object.keys(body.workers).sort()).toEqual(['batch', 'edit', 'normal', 'urgent']);
    for (const v of Object.values(body.workers)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('commit المُستنبَط من git rev-parse يطابق ما في shell (إن CWD شجرة git)', async () => {
    // اختبار «الحقيقة» — إن كانت CWD شجرة git فالقيمة يجب أن تطابق
    // ما يعطيه `git rev-parse HEAD` من نفس المسار.
    const r = await fastify.inject({ method: 'GET', url: '/v1/health' });
    const body = J<{ commit: string | null }>(r as { body: string })!;

    if (body.commit === null) return; // بيئة بلا git — pass تريفيّاً

    const { execSync } = await import('node:child_process');
    const shellSha = execSync('git rev-parse HEAD', {
      cwd: process.cwd(),
      encoding: 'utf-8',
    }).trim();
    expect(body.commit).toBe(shellSha);
  });

  it('لا يحمل حقولاً محظورة: env values · JWT · IP', async () => {
    const r = await fastify.inject({ method: 'GET', url: '/v1/health' });
    const body = r.body;
    // بعض القيَم الحسّاسة الشائعة — يجب ألّا تظهر
    expect(body).not.toContain('JWT_SECRET');
    expect(body).not.toContain('DATABASE_URL');
    expect(body).not.toContain('AI_KEY_ENCRYPTION_KEY');
    expect(body).not.toContain('Bearer ');
    expect(body).not.toMatch(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/); // no IPv4
  });
});
