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

import { checkInkPresent, formatInkGateFailure } from './ink-gate.js';

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
