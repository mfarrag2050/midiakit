// ink-gate — اختبارُ L-46 (أحمر ثمّ أخضر) على شهودٍ حقيقيّين.
//
// الشهود الأربعة (fixtures/ink-gate/) من حادثة 2026-09-14 حين أعلن الخادمُ
// أربعةَ رندراتٍ succeeded وكانت بطاقاتٍ بلا حبر. الاختبارُ يفشل قبل وصلِ
// الحارس في api-worker، ويمرّ بعده. المقياسُ نفسه (checkInkPresent) خالصٌ —
// لا حالة، لا I/O.
//
// **الأرقام المقيسة عند بناء الحارس (Rec.709 · T=8 · الحدّ 0.05٪):**
//   empty-flat.png       ratio=0.000%  →  hasInk=false  (يمسك)
//   empty-gradient.png   ratio=0.000%  →  hasInk=false  (يمسك — التدرّج لا يعبر T=8)
//   inked-plain.png      ratio=0.436%  →  hasInk=true   (يمرّ)
//   inked-breaking.png   ratio=1.230%  →  hasInk=true   (يمرّ)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Canvas, Image } from 'skia-canvas';

import {
  checkInkPresent,
  formatInkGateFailure,
  parseInkGateMode,
  decideInkGatePolicy,
  formatInkGateLog,
  type InkGateResult,
} from './ink-gate.js';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures', 'ink-gate');

async function loadFixture(name: string): Promise<{ pixels: Uint8ClampedArray; w: number; h: number }> {
  const buf = readFileSync(join(FIXTURES, name));
  const img = new Image();
  img.src = buf;
  await img.decode();
  const w = img.width, h = img.height;
  const canvas = new Canvas(w, h);
  const ctx = canvas.getContext('2d');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctx.drawImage(img as any, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  return { pixels: data, w, h };
}

describe('ink-gate · shocked-witness proof (L-46)', () => {
  it('empty-flat: أبيضُ مسطّح ⇒ hasInk=false (يجب أن يمسك)', async () => {
    const { pixels, w, h } = await loadFixture('empty-flat.png');
    const r = checkInkPresent(pixels, w, h);
    expect(r.hasInk).toBe(false);
    expect(r.ratio).toBeLessThan(0.0005);
  });

  it('empty-gradient: تدرّجٌ أملس ⇒ hasInk=false (يجب أن يمسك)', async () => {
    const { pixels, w, h } = await loadFixture('empty-gradient.png');
    const r = checkInkPresent(pixels, w, h);
    expect(r.hasInk).toBe(false);
    expect(r.ratio).toBeLessThan(0.0005);
  });

  it('inked-plain: نصٌّ على مساحة ⇒ hasInk=true (يجب أن يمرّ)', async () => {
    const { pixels, w, h } = await loadFixture('inked-plain.png');
    const r = checkInkPresent(pixels, w, h);
    expect(r.hasInk).toBe(true);
    expect(r.ratio).toBeGreaterThan(0.0005);
  });

  it('inked-breaking: نصٌّ عاجل ⇒ hasInk=true (يجب أن يمرّ)', async () => {
    const { pixels, w, h } = await loadFixture('inked-breaking.png');
    const r = checkInkPresent(pixels, w, h);
    expect(r.hasInk).toBe(true);
    expect(r.ratio).toBeGreaterThan(0.0005);
  });

  it('الفجوة: أعلى فارغ < أدنى مملوء (فصلٌ حقيقيّ لا وسط رقميّ)', async () => {
    const emptyFlat = await loadFixture('empty-flat.png');
    const emptyGrad = await loadFixture('empty-gradient.png');
    const inkedPlain = await loadFixture('inked-plain.png');
    const inkedBreak = await loadFixture('inked-breaking.png');
    const rFlat = checkInkPresent(emptyFlat.pixels, emptyFlat.w, emptyFlat.h);
    const rGrad = checkInkPresent(emptyGrad.pixels, emptyGrad.w, emptyGrad.h);
    const rPlain = checkInkPresent(inkedPlain.pixels, inkedPlain.w, inkedPlain.h);
    const rBreak = checkInkPresent(inkedBreak.pixels, inkedBreak.w, inkedBreak.h);

    const topEmpty = Math.max(rFlat.ratio, rGrad.ratio);
    const bottomInked = Math.min(rPlain.ratio, rBreak.ratio);
    // الفجوة يجب أن تكون واسعة — لا وسط رقميّ نتحرّاه، بل صفرٌ حرفيّ في جانبٍ ومئات بكسلات في آخر
    expect(topEmpty).toBeLessThan(bottomInked / 100);
  });
});

describe('ink-gate · حدود المدخلات', () => {
  it('يرمي على قماشٍ صغيرٍ جدّاً', () => {
    const pixels = new Uint8ClampedArray(4);
    expect(() => checkInkPresent(pixels, 1, 1)).toThrow(/too small/);
  });

  it('يرمي على buffer بطولٍ لا يطابق (w×h×4)', () => {
    const pixels = new Uint8ClampedArray(4 * 10 * 10 + 4);
    expect(() => checkInkPresent(pixels, 10, 10)).toThrow(/pixel buffer length/);
  });
});

describe('ink-gate · صياغة رسالة الفشل', () => {
  it('تحمل المقيسَ والحدَّ لا اتّهاماً بسبب', () => {
    const r = { ratio: 0, threshold: 0.0005, perPixelDelta: 8, hasInk: false };
    const msg = formatInkGateFailure(r);
    expect(msg).toContain('INK_GATE_EMPTY');
    expect(msg).toContain('0.000%'); // المقيس
    expect(msg).toContain('0.050%'); // الحدّ
    expect(msg).toContain('T=8');
    expect(msg).toContain('بلا حبر');
  });

  it('تُلحق failed_key حين يُمرَّر', () => {
    const r = { ratio: 0, threshold: 0.0005, perPixelDelta: 8, hasInk: false };
    const msg = formatInkGateFailure(r, 't/r/failed-output.png');
    expect(msg).toContain('failed_key=t/r/failed-output.png');
  });
});

describe('ink-gate · parseInkGateMode', () => {
  it('undefined ⇒ warn (الافتراضيّ)', () => {
    expect(parseInkGateMode(undefined)).toBe('warn');
  });
  it('null ⇒ warn', () => {
    expect(parseInkGateMode(null)).toBe('warn');
  });
  it('نصٌّ غير معروف ⇒ warn', () => {
    expect(parseInkGateMode('reject')).toBe('warn');
    expect(parseInkGateMode('ENFORCE')).toBe('warn'); // حساسٌ للحالة
    expect(parseInkGateMode('')).toBe('warn');
  });
  it('"enforce" حرفيّاً ⇒ enforce', () => {
    expect(parseInkGateMode('enforce')).toBe('enforce');
  });
});

describe('ink-gate · decideInkGatePolicy — القرارُ الخالص', () => {
  it('warn + hasInk=true ⇒ pass · لا رمي', () => {
    expect(decideInkGatePolicy('warn', true)).toEqual({ shouldThrow: false, logKind: 'pass' });
  });
  it('warn + hasInk=false ⇒ warn · لا رمي', () => {
    expect(decideInkGatePolicy('warn', false)).toEqual({ shouldThrow: false, logKind: 'warn' });
  });
  it('enforce + hasInk=true ⇒ pass · لا رمي', () => {
    expect(decideInkGatePolicy('enforce', true)).toEqual({ shouldThrow: false, logKind: 'pass' });
  });
  it('enforce + hasInk=false ⇒ block · رمي', () => {
    expect(decideInkGatePolicy('enforce', false)).toEqual({ shouldThrow: true, logKind: 'block' });
  });
});

describe('ink-gate · formatInkGateLog', () => {
  const r: InkGateResult = { ratio: 0.00436, threshold: 0.0005, perPixelDelta: 8, hasInk: true };
  const ctx = { templateId: 'plain', width: 1080, height: 1440, renderId: 'r-123' };

  it('pass · وسم ok + كلّ الحقول', () => {
    const line = formatInkGateLog('pass', r, ctx);
    expect(line).toContain('ink-gate ok:');
    expect(line).toContain('ratio=0.4360%');
    expect(line).toContain('threshold=0.0500%');
    expect(line).toContain('T=8');
    expect(line).toContain('template=plain');
    expect(line).toContain('size=1080x1440');
    expect(line).toContain('render=r-123');
    expect(line).not.toContain('INK_GATE_WOULD_FAIL');
    expect(line).not.toContain('INK_GATE_BLOCK');
  });

  it('warn · وسم INK_GATE_WOULD_FAIL', () => {
    const empty = { ratio: 0, threshold: 0.0005, perPixelDelta: 8, hasInk: false };
    const line = formatInkGateLog('warn', empty, ctx);
    expect(line).toContain('INK_GATE_WOULD_FAIL (warn-only)');
    expect(line).toContain('ratio=0.0000%');
    expect(line).toContain('template=plain');
    expect(line).toContain('size=1080x1440');
  });

  it('block · وسم INK_GATE_BLOCK', () => {
    const empty = { ratio: 0, threshold: 0.0005, perPixelDelta: 8, hasInk: false };
    const line = formatInkGateLog('block', empty, ctx);
    expect(line).toContain('INK_GATE_BLOCK (enforce)');
  });

  it('templateId مفقود ⇒ ?', () => {
    const line = formatInkGateLog('pass', r, { width: 1080, height: 1440 });
    expect(line).toContain('template=?');
    expect(line).not.toContain('render=');
  });
});
