import { describe, it, expect } from 'vitest';
import type { Timeline } from '@pf-mediakit/shared';
import { buildTimeline } from './build-timeline';

describe('buildTimeline', () => {
  it('preserves two sequential clips and derives the timeline duration', () => {
    const editorState = {
      fps: 25,
      size: 'portrait',
      tracks: [{
        id: 'media', type: 'media', index: 0,
        items: [
          { id: 'first', start: 0, end: 3, src: 'asset:first' },
          { id: 'second', start: 3, end: 5, src: 'asset:second' },
        ],
      }],
    } satisfies Parameters<typeof buildTimeline>[0];
    const before = structuredClone(editorState);

    const timeline = buildTimeline(editorState);

    expect(timeline).toStrictEqual({
      duration: 5, fps: 25, size: 'portrait', tracks: before.tracks,
    } satisfies Timeline);
    expect(timeline?.tracks[0]?.items).toHaveLength(2);
    expect(editorState).toStrictEqual(before);
  });

  it('uses the latest end across parallel tracks instead of adding durations', () => {
    const timeline = buildTimeline({
      fps: 30,
      size: 'reel',
      tracks: [
        { id: 'media', type: 'media', index: 0,
          items: [{ id: 'clip', start: 0, end: 4 }] },
        { id: 'text', type: 'text', index: 1,
          items: [{ id: 'title', start: 0, end: 7, value: 'عنوان' }] },
      ],
    });

    expect(timeline?.duration).toBe(7);
  });

  it('returns null when there are no tracks or all tracks have no items', () => {
    const emptyTracks: Timeline['tracks'][] = [
      [],
      [{ id: 'empty', type: 'media', index: 0, items: [] }],
    ];

    for (const tracks of emptyTracks) {
      expect(buildTimeline({ tracks, fps: 30, size: 'reel' })).toBeNull();
    }
  });
});
