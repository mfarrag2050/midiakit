import type { Track } from '@pf-mediakit/shared';

const NAME_KEYS = {
  media: 'pages.reels.names.clip',
  text: 'pages.reels.names.title',
  audio: 'pages.reels.names.audio',
} as const;

// Number by position, including split pieces and IDs without a numeric suffix.
// Internal IDs remain untouched and never serve as a display fallback.
export function itemName(track: Track, index: number): { key: string; n: number } {
  return {
    key: track.type === 'audio' && track.items[index]!.id === 'vo-main'
      ? 'pages.reels.names.audioMain'
      : NAME_KEYS[track.type],
    n: index + 1,
  };
}
