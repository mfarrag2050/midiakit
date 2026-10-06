import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_BRAND, type Timeline } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';
import { renderVideo } from './index.js';

// Real Canvas/FFmpeg boundary: catches a renderer that accepts but ignores the
// supplied timeline. No fonts or visual quality claims: only timing is tested.
const template: Template = {
  id: 'timeline-timing', name: 'اختبار توقيت', kind: 'video', sizes: ['x'],
  layers: [{ type: 'solid', fill: 'brand.colors.surface' }],
  video: { animation: [], outro: 'brand.motion.outro', easing: 'easeOutCubic' },
};
const timeline: Timeline = {
  duration: 4, fps: 4, size: 'square',
  tracks: [{ id: 'media', type: 'media', index: 0, items: [
    { id: 'first', start: 0, end: 2 }, { id: 'second', start: 2, end: 4 },
  ] }],
};
let outputDirectory: string;
beforeAll(() => { outputDirectory = mkdtempSync(join(tmpdir(), 'pf-mediakit-601c-')); });
afterAll(() => { rmSync(outputDirectory, { recursive: true, force: true }); });

describe('601c renderVideo real MP4 timing', () => {
  it('supplied timeline determines duration and fps instead of template timing', async () => {
    const outPath = join(outputDirectory, 'timeline.mp4');
    const rendered = await renderVideo({
      template, brand: DEFAULT_BRAND, content: {}, size: { w: 1080, h: 1080 },
      outPath, fps: 1, timeline,
    });
    expect(rendered).toMatchObject({ duration: 4, fps: 4, frameCount: 16 });
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=duration,nb_frames,r_frame_rate,width,height', '-of', 'json', outPath],
    { encoding: 'utf8' }));
    console.log('[601c local timing only] ffprobe:', JSON.stringify(probe));
    expect(probe.streams).toEqual([expect.objectContaining({
      duration: '4.000000', nb_frames: '16', r_frame_rate: '4/1', width: 1080, height: 1080,
    })]);
  });

  it('without timeline retains template timing and the explicit fps', async () => {
    const rendered = await renderVideo({
      template, brand: DEFAULT_BRAND, content: {}, size: { w: 1080, h: 1080 },
      outPath: join(outputDirectory, 'legacy.mp4'), fps: 1,
    });
    expect(rendered).toMatchObject({ duration: 7.5, fps: 1, frameCount: 8 });
  });
});
