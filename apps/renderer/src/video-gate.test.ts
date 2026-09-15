// video-gate — اختبارُ الشروط الأربعة + السياسة + L-46 على طفرة.
//
// **مبدأ الاختبار (٧٠١):** لكلّ شرطٍ حالتان (ناجحة · فاشلة). لكلّ mode
// حالتان. طفرةٌ واحدةٌ على parseVideoGateMode.
//
// عيّنات الاختبار **مصنوعةٌ برمجيّاً** (Uint8ClampedArray) — لا تعتمد على
// أصولٍ من القرص. الشاهد على مقياس pair-diff من ٣٤٠ §١ في `video-gate.ts`
// (تعليقُ المعايرة).

import { describe, it, expect } from 'vitest';
import {
  checkVideoBasics,
  pixelDiffRatio,
  checkFramesNotIdentical,
  composeVideoGate,
  parseVideoGateMode,
  decideVideoGatePolicy,
  formatVideoGateLog,
  formatVideoGateFailure,
  type VideoGateComposite,
} from './video-gate.js';

// ── مساعدات صنع الإطارات ─────────────────────────

/** إطارٌ مسطّحٌ بلون واحد. */
function solidFrame(w: number, h: number, r: number, g: number, b: number) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = 255;
  }
  return { pixels: px, width: w, height: h };
}

/** إطارٌ فيه «حبر» — خطٌّ عموديّ داكن على خلفيّة فاتحة (يعطي حوافّ حادّة). */
function inkedFrame(w: number, h: number) {
  const f = solidFrame(w, h, 240, 240, 240);
  const lineX = Math.floor(w / 2);
  for (let y = 0; y < h; y++) {
    const idx = (y * w + lineX) * 4;
    f.pixels[idx] = 20; f.pixels[idx+1] = 20; f.pixels[idx+2] = 20;
    // نجعل السطر عريضاً كافياً ليعبر عتبة 0.05% (~40 عمود يعطي ~2.5%)
    for (let dx = 1; dx <= 40; dx++) {
      const idx2 = (y * w + lineX + dx) * 4;
      f.pixels[idx2] = 20; f.pixels[idx2+1] = 20; f.pixels[idx2+2] = 20;
    }
  }
  return f;
}

// ── الشرطان 1+2 ──────────────────────────────────

describe('video-gate · checkVideoBasics', () => {
  it('duration>0 · frames>1 ⇒ ok', () => {
    const r = checkVideoBasics(8.4, 252);
    expect(r).toEqual({ durationSec: 8.4, frameCount: 252, durationOk: true, framesOk: true, ok: true });
  });
  it('duration=0 ⇒ !durationOk', () => {
    const r = checkVideoBasics(0, 100);
    expect(r.durationOk).toBe(false);
    expect(r.ok).toBe(false);
  });
  it('frames=1 ⇒ !framesOk (إطار واحد = صورة)', () => {
    const r = checkVideoBasics(3, 1);
    expect(r.framesOk).toBe(false);
    expect(r.ok).toBe(false);
  });
  it('frames=0 ⇒ !framesOk', () => {
    const r = checkVideoBasics(3, 0);
    expect(r.framesOk).toBe(false);
    expect(r.ok).toBe(false);
  });
});

// ── الشرط 4 · فرق البكسلات ──────────────────────

describe('video-gate · pixelDiffRatio', () => {
  it('إطاران متطابقان ⇒ 0', () => {
    const a = solidFrame(10, 10, 100, 100, 100);
    const b = solidFrame(10, 10, 100, 100, 100);
    expect(pixelDiffRatio(a.pixels, b.pixels)).toBe(0);
  });
  it('يتغاضى عن ضجيج ≤2 (تسامح ترميز)', () => {
    const a = solidFrame(10, 10, 100, 100, 100);
    const b = solidFrame(10, 10, 102, 102, 102); // دلتا=2 على كلّ قناة
    expect(pixelDiffRatio(a.pixels, b.pixels)).toBe(0);
  });
  it('دلتا 3 على قناةٍ واحدة ⇒ يُحسب مختلفاً', () => {
    const a = solidFrame(10, 10, 100, 100, 100);
    const b = solidFrame(10, 10, 103, 100, 100);
    expect(pixelDiffRatio(a.pixels, b.pixels)).toBe(1); // كلّ البكسلات
  });
  it('يرمي على أطوالٍ مختلفة', () => {
    const a = solidFrame(10, 10, 0, 0, 0);
    const b = solidFrame(20, 10, 0, 0, 0);
    expect(() => pixelDiffRatio(a.pixels, b.pixels)).toThrow(/length mismatch/);
  });
});

describe('video-gate · checkFramesNotIdentical (ok = start↔middle > threshold · ٣٤٠b)', () => {
  it('٣ إطارات متطابقة ⇒ ok=false (الحالة الاصطناعيّة · ٣٤٠ §١.٣)', () => {
    const f = solidFrame(50, 50, 128, 128, 128);
    const r = checkFramesNotIdentical([f, f, f]);
    expect(r.contentAppearDiff).toBe(0);
    expect(r.maxDiff).toBe(0);
    expect(r.ok).toBe(false);
    expect(r.pairDiffs).toEqual([0, 0, 0]);
  });

  it('start≠middle · باقي متطابق ⇒ ok=true (محتوى ظهر)', () => {
    const a = solidFrame(50, 50, 100, 100, 100);
    const b = solidFrame(50, 50, 200, 200, 200);
    const r = checkFramesNotIdentical([a, b, b]);
    expect(r.contentAppearDiff).toBeGreaterThan(0.5);
    expect(r.ok).toBe(true);
  });

  // ══════════════ الحالة الحاسمة (٣٤٠b) ══════════════
  // فيديو **فارغ المحتوى** فيه **outro يُظلم القماش**:
  //   start = surface  ·  middle = surface  ·  end = black
  //   pair_diffs = [0, 100%, 100%]  →  maxDiff = 100% (كان يمرّ الحارس القديم)
  //                                    contentAppearDiff = 0 (يسقط الحارس الجديد ✓)
  it('outro-فارغ · start=middle=surface · end=black ⇒ ok=false (الطفرة الحاسمة)', () => {
    const surface = solidFrame(100, 100, 240, 240, 240);
    const black = solidFrame(100, 100, 0, 0, 0);
    const r = checkFramesNotIdentical([surface, surface, black]);
    // pair_diffs: [start↔middle=0, middle↔end=100%, start↔end=100%]
    expect(r.pairDiffs[0]).toBe(0);
    expect(r.pairDiffs[1]).toBe(1);
    expect(r.pairDiffs[2]).toBe(1);
    expect(r.maxDiff).toBe(1); // الحارس القديم كان يقول ok=true هنا
    expect(r.contentAppearDiff).toBe(0); // الحارس الجديد يمسك
    expect(r.ok).toBe(false); // ⇐ الفرق الحاسم
  });

  it('outro-كامل · start=blank · middle=inked · end=black ⇒ ok=true (النموذج الحيّ)', () => {
    const blank = solidFrame(100, 100, 240, 240, 240);
    const inked = solidFrame(100, 100, 20, 20, 20); // تباين كامل
    const black = solidFrame(100, 100, 0, 0, 0);
    const r = checkFramesNotIdentical([blank, inked, black]);
    expect(r.contentAppearDiff).toBe(1); // start↔middle = 100%
    expect(r.ok).toBe(true);
  });

  it('يرمي إن كان عدد الإطارات ≠ 3', () => {
    const f = solidFrame(10, 10, 0, 0, 0);
    expect(() => checkFramesNotIdentical([f, f])).toThrow(/expected 3 frames/);
    expect(() => checkFramesNotIdentical([f, f, f, f])).toThrow(/expected 3 frames/);
  });

  it('يرمي على أبعادٍ مختلفة', () => {
    const a = solidFrame(10, 10, 0, 0, 0);
    const b = solidFrame(20, 10, 0, 0, 0);
    expect(() => checkFramesNotIdentical([a, b, a])).toThrow(/dimensions mismatch/);
  });
});

// ── composeVideoGate · الجمع الرباعيّ ───────────

describe('video-gate · composeVideoGate', () => {
  const W = 1080, H = 1350;
  const inked = inkedFrame(W, H);
  const blank = solidFrame(W, H, 240, 240, 240);

  it('«فيديو فيه محتوى» ⇒ allOk=true (النموذج الحيّ من ٣٤٠ §١)', () => {
    const r = composeVideoGate({
      durationSec: 8.4, frameCount: 252,
      middleFramePixels: inked.pixels, width: W, height: H,
      frames: [blank, inked, blank], // start فارغ · middle مليء · end فارغ
    });
    expect(r.allOk).toBe(true);
    expect(r.firstFailure).toBeNull();
  });

  it('«فيديو ثابت فارغ» ⇒ allOk=false (firstFailure=middleInk)', () => {
    const r = composeVideoGate({
      durationSec: 7.0, frameCount: 210,
      middleFramePixels: blank.pixels, width: W, height: H,
      frames: [blank, blank, blank],
    });
    expect(r.allOk).toBe(false);
    expect(r.firstFailure).toBe('middleInk');
  });

  it('duration=0 يُبلَّغ أوّلاً (قبل الحبر والفرق)', () => {
    const r = composeVideoGate({
      durationSec: 0, frameCount: 210,
      middleFramePixels: inked.pixels, width: W, height: H,
      frames: [blank, inked, blank],
    });
    expect(r.firstFailure).toBe('duration');
  });

  it('frames=1 يُبلَّغ ثانياً بعد duration', () => {
    const r = composeVideoGate({
      durationSec: 5, frameCount: 1,
      middleFramePixels: inked.pixels, width: W, height: H,
      frames: [blank, inked, blank],
    });
    expect(r.firstFailure).toBe('frames');
  });

  it('إطاراتٌ متطابقةٌ فيها حبر ⇒ firstFailure=framesIdentical (صورةٌ واحدةٌ مكرَّرة)', () => {
    const r = composeVideoGate({
      durationSec: 8.4, frameCount: 252,
      middleFramePixels: inked.pixels, width: W, height: H,
      frames: [inked, inked, inked], // كلّها متطابقة
    });
    expect(r.middleInk.hasInk).toBe(true); // الوسط فيه حبر
    expect(r.framesDiff.ok).toBe(false); // start↔middle = 0
    expect(r.firstFailure).toBe('framesIdentical');
  });

  // ══════════════ الطفرة الحاسمة على مستوى compose (٣٤٠b) ══════════════
  it('«outro-يخبو على قماشٍ فارغٍ» ⇒ firstFailure=middleInk أوّلاً، ولو مرّ ⇒ framesIdentical', () => {
    // start=surface · middle=surface · end=black · مقنعٌ لأيّ حارسٍ ينظر إلى max_diff
    const r = composeVideoGate({
      durationSec: 8.0, frameCount: 240,
      middleFramePixels: blank.pixels, width: W, height: H,
      frames: [blank, blank, solidFrame(W, H, 0, 0, 0)],
    });
    // maxDiff = 100% (blank↔black · start↔end) — كان يخدع الحارس القديم
    expect(r.framesDiff.maxDiff).toBe(1);
    // لكن الحارس الجديد ينظر إلى start↔middle = 0
    expect(r.framesDiff.contentAppearDiff).toBe(0);
    expect(r.framesDiff.ok).toBe(false);
    // firstFailure يجد middleInk أوّلاً (blank بلا حوافّ)، وهذا مقصود ترتيبه
    expect(r.firstFailure).toBe('middleInk');
    expect(r.allOk).toBe(false);
  });
});

// ── parseVideoGateMode + decideVideoGatePolicy ──

describe('video-gate · parseVideoGateMode', () => {
  it('undefined ⇒ warn (الافتراضيّ)', () => {
    expect(parseVideoGateMode(undefined)).toBe('warn');
  });
  it('null ⇒ warn', () => {
    expect(parseVideoGateMode(null)).toBe('warn');
  });
  it('نصٌّ غير معروف ⇒ warn', () => {
    expect(parseVideoGateMode('reject')).toBe('warn');
    expect(parseVideoGateMode('ENFORCE')).toBe('warn');
    expect(parseVideoGateMode('')).toBe('warn');
  });
  it('"enforce" حرفيّاً ⇒ enforce', () => {
    expect(parseVideoGateMode('enforce')).toBe('enforce');
  });
});

describe('video-gate · decideVideoGatePolicy', () => {
  it('warn + allOk=true ⇒ pass · لا رمي', () => {
    expect(decideVideoGatePolicy('warn', true)).toEqual({ shouldThrow: false, logKind: 'pass' });
  });
  it('warn + allOk=false ⇒ warn · لا رمي', () => {
    expect(decideVideoGatePolicy('warn', false)).toEqual({ shouldThrow: false, logKind: 'warn' });
  });
  it('enforce + allOk=true ⇒ pass · لا رمي', () => {
    expect(decideVideoGatePolicy('enforce', true)).toEqual({ shouldThrow: false, logKind: 'pass' });
  });
  it('enforce + allOk=false ⇒ block · رمي', () => {
    expect(decideVideoGatePolicy('enforce', false)).toEqual({ shouldThrow: true, logKind: 'block' });
  });
});

// ── formatVideoGateLog + formatVideoGateFailure ─

describe('video-gate · formatVideoGateLog', () => {
  const W = 1080, H = 1350;
  const inked = inkedFrame(W, H);
  const blank = solidFrame(W, H, 240, 240, 240);
  const passing: VideoGateComposite = composeVideoGate({
    durationSec: 8.4, frameCount: 252,
    middleFramePixels: inked.pixels, width: W, height: H,
    frames: [blank, inked, blank],
  });
  const ctx = { templateId: 'breaking', width: W, height: H, fps: 30, renderId: 'r-xyz' };

  it('pass · وسم ok + كلّ الأرقام (للتوزيع)', () => {
    const line = formatVideoGateLog('pass', passing, ctx);
    expect(line).toContain('video-gate ok:');
    expect(line).toContain('duration=8.40s');
    expect(line).toContain('frames=252');
    expect(line).toContain('mid_ink=');
    expect(line).toContain('content_appear='); // الحاكم في الشرط ٤ (٣٤٠b)
    expect(line).toContain('pair_diffs=['); // للتشخيص فقط
    expect(line).toContain('template=breaking');
    expect(line).toContain('size=1080x1350');
    expect(line).toContain('fps=30');
    expect(line).toContain('render=r-xyz');
    expect(line).not.toContain('VIDEO_GATE_WOULD_FAIL');
    expect(line).not.toContain('max_diff=');
  });

  it('warn · وسم VIDEO_GATE_WOULD_FAIL', () => {
    const failing = composeVideoGate({
      durationSec: 7, frameCount: 210,
      middleFramePixels: blank.pixels, width: W, height: H,
      frames: [blank, blank, blank],
    });
    const line = formatVideoGateLog('warn', failing, ctx);
    expect(line).toContain('VIDEO_GATE_WOULD_FAIL (warn-only)');
    expect(line).toContain('first_failure=middleInk');
  });

  it('block · وسم VIDEO_GATE_BLOCK', () => {
    const failing = composeVideoGate({
      durationSec: 7, frameCount: 210,
      middleFramePixels: blank.pixels, width: W, height: H,
      frames: [blank, blank, blank],
    });
    const line = formatVideoGateLog('block', failing, ctx);
    expect(line).toContain('VIDEO_GATE_BLOCK (enforce)');
  });
});

describe('video-gate · formatVideoGateFailure', () => {
  const W = 100, H = 100;
  const blank = solidFrame(W, H, 240, 240, 240);
  const inked = inkedFrame(W, H);

  it('firstFailure=middleInk ⇒ يذكر mid_ink والحدّ', () => {
    const r = composeVideoGate({
      durationSec: 7, frameCount: 210,
      middleFramePixels: blank.pixels, width: W, height: H,
      frames: [blank, blank, blank],
    });
    const msg = formatVideoGateFailure(r);
    expect(msg).toContain('VIDEO_GATE_EMPTY');
    expect(msg).toContain('mid_ink');
    expect(msg).toContain('بلا حبر');
  });

  it('firstFailure=framesIdentical ⇒ يذكر content_appear (لا max_diff · ٣٤٠b)', () => {
    const r = composeVideoGate({
      durationSec: 7, frameCount: 210,
      middleFramePixels: inked.pixels, width: W, height: H,
      frames: [inked, inked, inked],
    });
    const msg = formatVideoGateFailure(r);
    expect(msg).toContain('VIDEO_GATE_EMPTY');
    expect(msg).toContain('content_appear');
    expect(msg).toContain('لا محتوى يظهر');
    expect(msg).not.toContain('max_diff'); // outro-blind بحكم التصميم
  });

  it('failed_key يُلحق حين يُمرّر', () => {
    const r = composeVideoGate({
      durationSec: 0, frameCount: 210,
      middleFramePixels: inked.pixels, width: W, height: H,
      frames: [blank, inked, blank],
    });
    const msg = formatVideoGateFailure(r, 't/r/failed.mp4');
    expect(msg).toContain('failed_key=t/r/failed.mp4');
  });
});
