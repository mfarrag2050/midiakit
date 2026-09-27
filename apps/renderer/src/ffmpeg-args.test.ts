// mk/486c · ffmpegArgs — عددُ threads صريحٌ في التحقّق، auto في الإنتاج.
// الاختبار يفصل: undefined ⇒ لا `-threads` في الوسائط · رقمٌ ⇒ يظهر.

import { describe, expect, it } from 'vitest';
import { ffmpegArgs } from './index.js';

const SIZE = { w: 1080, h: 1350 };
const OUT = '/tmp/x.mp4';

function findThreadsIndex(args: readonly string[]): number {
  return args.indexOf('-threads');
}

describe('ffmpegArgs · encodeThreads (486c)', () => {
  it('encodeThreads=undefined ⇒ لا -threads (auto libx264 · إنتاج)', () => {
    const a = ffmpegArgs(SIZE, 30, OUT);
    expect(findThreadsIndex(a)).toBe(-1);
  });

  it('encodeThreads=1 ⇒ يظهر -threads 1 بعد -c:v libx264 (تحقّق حتميّ)', () => {
    const a = ffmpegArgs(SIZE, 30, OUT, undefined, 1);
    const tIdx = findThreadsIndex(a);
    expect(tIdx).toBeGreaterThanOrEqual(0);
    expect(a[tIdx + 1]).toBe('1');
    const codecIdx = a.indexOf('libx264');
    expect(codecIdx).toBeGreaterThanOrEqual(0);
    expect(tIdx).toBeGreaterThan(codecIdx);
  });

  it('encodeThreads=4 ⇒ -threads 4 (تمرير رقم عام)', () => {
    const a = ffmpegArgs(SIZE, 30, OUT, undefined, 4);
    const tIdx = findThreadsIndex(a);
    expect(a[tIdx + 1]).toBe('4');
  });

  it('encodeThreads=0 ⇒ يظهر -threads 0 (auto مصرَّح)', () => {
    // 0 ليس undefined — نُمرِّره ليختار المستخدم auto صراحةً إن أراد.
    const a = ffmpegArgs(SIZE, 30, OUT, undefined, 0);
    const tIdx = findThreadsIndex(a);
    expect(a[tIdx + 1]).toBe('0');
  });
});
