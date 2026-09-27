import { describe, expect, it } from 'vitest';
import type { Track } from '@pf-mediakit/shared';
import ar from '../../../../packages/i18n/src/ar.json';
import en from '../../../../packages/i18n/src/en.json';
import mixed from '../../../../packages/i18n/src/mixed.json';
import { formatNumber } from '../format/digits';
import { itemName } from './item-name';

describe('479 clip display names do not expose internal IDs', () => {
  it.each([
    ['media', 'clip-01', 'clip-01__split_1', 'مقطع ٢', 'Clip 2'],
    ['text', 'title-01', 'opaque-id', 'عنوان ٢', 'Title 2'],
    ['audio', 'tone-01', 'tone-02', 'صوت ٢', 'Audio 2'],
    ['audio', 'tone-01', 'vo-main', 'صوت رئيسي', 'Main audio'],
  ] as const)('%s: %s / %s uses localized names and the chosen digits', (type, firstId, secondId, arabic, english) => {
    const track: Track = {
      id: 'track', type, index: 0,
      items: [
        { id: firstId, start: 0, end: 1, effects: [] },
        { id: secondId, start: 1, end: 2, effects: [] },
      ],
    };
    const before = structuredClone(track);
    const displayName = itemName(track, 1);
    for (const [dict, digits, expected] of [
      [ar, 'arabic-indic', arabic],
      [mixed, 'arabic-indic', arabic],
      [en, 'latin', english],
    ] as const) {
      const template = displayName.key.split('.').reduce<unknown>((node, key) =>
        (node as Record<string, unknown>)[key], dict);
      expect(typeof template).toBe('string');
      expect((template as string).replace('{n}', formatNumber(displayName.n, digits))).toBe(expected);
    }
    expect(track).toEqual(before);
  });
});
