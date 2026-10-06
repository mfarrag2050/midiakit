import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import { DEFAULT_BRAND, type Timeline } from '@pf-mediakit/shared';
import { TEMPLATES } from '@pf-mediakit/templates';
import * as renderer from './index.js';

const boundary = vi.hoisted(() => ({
  processors: new Map<string, (job: Job) => Promise<void>>(),
}));
vi.mock('bullmq', async (original) => {
  const actual = await original<typeof import('bullmq')>();
  return { ...actual, Worker: class {
    constructor(name: string, processor: (job: Job) => Promise<void>) {
      boundary.processors.set(name, processor);
    }
    on() { return this; }
    async close() {}
  } };
});
vi.mock('ioredis', () => ({ default: class {
  async incr() { return 1; }
  async decr() { return 0; }
} }));
vi.mock('pg', () => ({ default: { Pool: class {
  async connect() { return { async query() { return { rows: [], rowCount: 0 }; }, release() {} }; }
  async end() {}
} } }));
vi.mock('node:fs', async (original) => ({
  ...await original<typeof import('node:fs')>(),
  mkdirSync: vi.fn(), existsSync: () => false,
}));

let running: Awaited<ReturnType<typeof import('./api-worker.js')['startApiWorker']>>;
const renderReached = new Error('601c render boundary reached');
const renderSpy = vi.spyOn(renderer, 'renderVideo');

beforeAll(async () => {
  vi.stubEnv('DATABASE_URL_APP', 'postgres://127.0.0.1:19042/isolated-mock');
  const { startApiWorker } = await import('./api-worker.js');
  running = startApiWorker();
});
beforeEach(() => { renderSpy.mockReset().mockRejectedValue(renderReached); });
afterAll(async () => { await running.stop(); renderSpy.mockRestore(); vi.unstubAllEnvs(); });

async function submit(timeline?: Timeline) {
  // The ticket explicitly authorizes a spy at the renderVideo boundary. Stop
  // there to avoid FFmpeg/S3; the real worker callback and template guard run.
  const job = { id: '601c-job', data: {
    renderId: '601c-render', tenantId: '601c-tenant', projectId: '601c-project',
    brandSnapshot: structuredClone(DEFAULT_BRAND), templateSnapshot: TEMPLATES['reel'],
    content: { title: 'عنوان تجريبي' }, size: 'instagram', format: 'mp4',
    ...(timeline && { timeline }),
  } } as Job;
  await expect(boundary.processors.get('render-normal')!(job)).rejects.toBe(renderReached);
  expect(renderSpy).toHaveBeenCalledTimes(1);
  return renderSpy.mock.calls[0]![0];
}

describe('601c actual API worker passes timeline to renderVideo', () => {
  it.each([
    ['square', 1080, 1080], ['portrait', 1080, 1350], ['reel', 1080, 1920],
  ] as const)('%s overrides instagram with matching %s×%s dimensions', async (size, w, h) => {
    const timeline: Timeline = { size, duration: 4, fps: 24,
      tracks: [{ id: 'text', type: 'text', index: 0, items: [
        { id: 'first', start: 0, end: 2, value: 'المشهد الأول' },
        { id: 'second', start: 2, end: 4, value: 'المشهد الثاني' },
      ] }] };
    const args = await submit(timeline);
    expect(args.timeline).toBe(timeline);
    expect(args.size).toEqual({ w, h });
  });

  it('without timeline retains the original render arguments', async () => {
    const args = await submit();
    expect(args).toEqual({
      template: TEMPLATES['reel'], brand: expect.any(Object), content: { title: 'عنوان تجريبي' },
      size: { w: 1080, h: 1440 }, outPath: expect.stringMatching(/mk-render-601c-render\/output\.mp4$/),
    });
  });
});
