import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import type { Timeline } from '@pf-mediakit/shared';
import type { RenderJobPayload } from '../../queues/index.js';
import errorHandler from '../../plugins/error-handler.js';
import createRender from './create.js';

// Queue and DB are boundaries here; route, schema, limits and enqueue execute.
const boundary = vi.hoisted(() => ({
  jobs: new Map<string, { id: string; data: RenderJobPayload; priority: number }>(),
  query: vi.fn(), add: vi.fn(),
  headline: 'نص تجريبي', recent: 0,
}));
vi.mock('../../config.js', () => ({ config: {
  REDIS_URL: 'redis://127.0.0.1:19049/3', BULLMQ_PREFIX: 'pf-mediakit-test-601c',
} }));
vi.mock('ioredis', () => ({ default: class {} }));
vi.mock('bullmq', () => ({ Queue: class {
  async getJobs() { return []; }
  async getJob(id: string) { return boundary.jobs.get(id); }
  async add(name: string, payload: RenderJobPayload, options: { jobId: string; priority: number }) {
    boundary.add(name, payload, options);
    const job = { id: options.jobId, data: payload, priority: options.priority };
    boundary.jobs.set(job.id, job);
    return job;
  }
} }));

const projectId = '601c0000-0000-4000-8000-000000000001';
const renderId = '601c0000-0000-4000-8000-000000000002';
const timeline: Timeline = {
  duration: 4, fps: 24, size: 'portrait',
  tracks: [{ id: 'text', type: 'text', index: 0, items: [
    { id: 'first', start: 0, end: 2, value: 'المشهد الأول', anchor: 'center',
      keyframes: [{ t: 0, opacity: 0, ease: 'easeOut' }, { t: 1, opacity: 1 }] },
    { id: 'second', start: 2, end: 4, value: 'المشهد الثاني', fsScale: 1.2,
      effects: [{ type: 'example', amount: 0.5 }] },
  ] }],
};
let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.decorate('authenticated', async (req) => {
    req.auth = { tenantId: 'tenant', userId: 'writer', role: 'writer', sessionId: 'session' };
    req.dbClient = { query: boundary.query, release() {} } as unknown as PoolClient;
  });
  await app.register(errorHandler);
  await app.register(createRender, { prefix: '/v1/renders' });
  await app.ready();
});
afterAll(async () => { await app.close(); });
beforeEach(() => {
  boundary.jobs.clear(); boundary.add.mockClear(); boundary.query.mockReset();
  boundary.headline = 'نص تجريبي'; boundary.recent = 0;
  boundary.query.mockImplementation(async (sql: string) => {
    let rows: unknown[];
    if (sql.includes('FROM projects')) rows = [{ id: projectId, content: { headline: boundary.headline },
      brand_kit_id: 'brand', template_id: 'template', state: 'draft' }];
    else if (sql.includes('JOIN plans')) rows = [{ plan_concurrent: 3, plan_videos: null, overrides: {} }];
    else if (sql.includes('FROM brand_kits')) rows = [{ config: {} }];
    else if (sql.includes('FROM templates')) rows = [{ definition: {
      id: 'test-template', name: 'قالب تجريبي', kind: 'static', sizes: ['x'],
      layers: [{ type: 'solid', fill: 'brand.colors.background' }],
    } }];
    else if (sql.includes('INSERT INTO renders')) rows = [{ id: renderId, created_at: new Date() }];
    else if (sql.includes('average_seconds')) rows = [{ average_seconds: null }];
    else if (sql.includes('count(*)')) rows = [{ n: sql.includes("interval '1 minute'") ? boundary.recent : 0 }];
    else if (sql === 'COMMIT') rows = [];
    else throw new Error(`Unexpected SQL in timeline route test: ${sql}`);
    return { rows, rowCount: rows.length };
  });
});

function requestTimeline(submitted?: unknown) {
  return app.inject({ method: 'POST', url: '/v1/renders', payload: {
    project_id: projectId, size: 'instagram', format: 'mp4',
    ...(submitted !== undefined && { timeline: submitted }),
  } });
}

describe('601c POST /v1/renders timeline contract', () => {
  it.each([
    ['square', 'x', 1, 4], ['portrait', 'feed', 24, 4], ['reel', 'reel', 60, 90],
  ] as const)('%s reaches the queue unchanged with matching size %s', async (size, apiSize, fps, duration) => {
    const submitted = { ...timeline, size, fps, duration };
    const response = await requestTimeline(submitted);
    expect(response.statusCode, response.body).toBe(202);
    expect(boundary.jobs.get(response.json().id)?.data).toMatchObject({ size: apiSize, timeline: submitted });
    expect(boundary.jobs.get(renderId)?.data.timeline).toEqual(submitted);
    const insert = boundary.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO renders'));
    expect(insert?.[1][2]).toBe(apiSize);
  });

  it('without timeline preserves the original instagram payload', async () => {
    const response = await requestTimeline();
    expect(response.statusCode, response.body).toBe(202);
    expect(boundary.jobs.get(renderId)?.data.size).toBe('instagram');
    expect(boundary.jobs.get(renderId)?.data).not.toHaveProperty('timeline');
  });

  // Boundary matrix: null/string/empty tracks; malformed items; size object/name;
  // nonpositive/over-limit duration and fps. Rejection must precede DB and queue.
  it.each([
    ['tracks null', { tracks: null }, 'timeline.tracks'],
    ['tracks string', { tracks: 'x' }, 'timeline.tracks'],
    ['tracks empty', { tracks: [] }, 'timeline.tracks'],
    ['items null', { tracks: [{ ...timeline.tracks[0], items: null }] }, 'timeline.tracks.0.items'],
    ['size object', { size: { width: 1080, height: 1350 } }, 'timeline.size'],
    ['size unknown', { size: 'instagram' }, 'timeline.size'],
    ['duration zero', { duration: 0 }, 'timeline.duration'],
    ['duration over limit', { duration: 90.01 }, 'timeline.duration'],
    ['fps zero', { fps: 0 }, 'timeline.fps'],
    ['fps below limit', { fps: 0.5 }, 'timeline.fps'],
    ['fps over limit', { fps: 61 }, 'timeline.fps'],
  ])('%s is rejected before INSERT/enqueue', async (_scenario, patch, field) => {
    const response = await requestTimeline({ ...timeline, ...patch as object });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error).toMatchObject({ code: 'VALIDATION_FAILED', field });
    expect(boundary.query).not.toHaveBeenCalled();
    expect(boundary.add).not.toHaveBeenCalled();
  });

  it.each([
    ['headline', 'HEADLINE_TOO_LONG', 422], ['rate', 'EXPORTS_RATE_LIMIT', 429],
  ] as const)('timeline does not bypass the existing %s limit', async (limit, code, status) => {
    if (limit === 'headline') boundary.headline = 'أ'.repeat(201);
    else boundary.recent = 20;
    const response = await requestTimeline(timeline);
    expect(response.statusCode).toBe(status);
    expect(response.json().error.code).toBe(code);
    expect(boundary.add).not.toHaveBeenCalled();
  });
});
