import { afterEach, expect, it, vi } from 'vitest';
import { Canvas, Image } from 'skia-canvas';
import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import { REEL } from '@pf-mediakit/templates';
import { applyLocaleToBrand, buildTimelinePlan, drawTimelineAt, resolveBrand } from '@pf-mediakit/engine';
import { loadSampleBackgrounds } from './sample-backgrounds';
import { SAMPLE } from './sample-timeline';

afterEach(() => { vi.unstubAllGlobals(); });

it('mk/563: seeking each sample clip draws a distinct, opaque, non-grey local background', async () => {
  // Exercise actual image decoding without a browser or any network request.
  vi.stubGlobal('Image', Image);
  const assets = { images: await loadSampleBackgrounds() };
  const timeline = { ...SAMPLE, tracks: SAMPLE.tracks.filter(track => track.type === 'media') };
  const canvas = new Canvas(1080, 1920);
  const ctx = canvas.getContext('2d');
  const args = {
    ctx: ctx as unknown as Parameters<typeof drawTimelineAt>[0]['ctx'],
    size: { w: canvas.width, h: canvas.height },
    brand: resolveBrand(applyLocaleToBrand(DEFAULT_BRAND, 'ar')),
    template: REEL,
    timeline,
    assets,
  };
  const plan = buildTimelinePlan(args);
  const pixels = timeline.tracks.flatMap(track => track.items).map(clip => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawTimelineAt({ ...args, plan, content: { locale: 'ar' }, t: (clip.start + clip.end) / 2 });
    const pixel = [...ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data];
    expect(pixel[3], clip.id).toBe(255);
    expect(new Set(pixel.slice(0, 3)).size, clip.id).toBeGreaterThan(1);
    return pixel.join(',');
  });
  expect(new Set(pixels).size).toBe(3);
});
