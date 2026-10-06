import type { Timeline } from '@pf-mediakit/shared';

export function buildTimeline(editorState: {
  tracks: Timeline['tracks'];
  fps: number;
  size: Timeline['size'];
}): Timeline | null {
  const { tracks, fps, size } = editorState;
  const ends = tracks.flatMap((track) => track.items.map((clip) => clip.end));
  if (ends.length === 0) return null;

  return { duration: Math.max(...ends), fps, size, tracks };
}
