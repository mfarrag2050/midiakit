import type { TimelineSize } from '@pf-mediakit/shared';

// CLI size presets; portrait is feed (1350), never instagram (1440).
export const TIMELINE_OUTPUT: Readonly<Record<TimelineSize, {
  readonly apiSize: 'x' | 'feed' | 'reel';
  readonly dimensions: { readonly w: number; readonly h: number };
}>> = {
  square: { apiSize: 'x', dimensions: { w: 1080, h: 1080 } },
  portrait: { apiSize: 'feed', dimensions: { w: 1080, h: 1350 } },
  reel: { apiSize: 'reel', dimensions: { w: 1080, h: 1920 } },
};
