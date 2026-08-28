// scripts/verify-wrap-fidelity.mjs
//
// تحقيق دقّة النقل: هل `wrapAlternating` في packages/engine تُنتج نفس
// المخرج الذي كان يُنتجه `cvWrapTokens` في reference/aa-media-kit.html؟
//
// المنهج: نسخة **حرفية** من cvWrapTokens (والدوال المُساعدة cvWordWidth،
// cvSpaceWidth، cvLineWidth، cvParseTokens) — نمرّرها ctx من skia-canvas
// المُحمَّل بنفس الخط والحجم، ثم نقارن سطراً سطراً بمخرج wrapAlternating.
//
// إن اختلفا: انحدار في النقل يجب إصلاحه.
// إن تطابقا: النمط الذي يشتكي منه المستخدم هو نمط الأصل حرفياً.

import { Canvas, FontLibrary } from 'skia-canvas';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BRAND } from '@pf-mediakit/shared';
import {
  parseTokens,
  createCanvasMeasurer,
  wrapAlternating,
} from '@pf-mediakit/engine';

// ── نُسخ حرفية من reference/aa-media-kit.html (1769–1842) ────────

/* eslint-disable */
function cvParseTokens(text) {
  const tokens = [];
  let bold = false,
    accent = false,
    cur = '';
  const flush = () => {
    cur
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => tokens.push({ text: w, bold, accent }));
    cur = '';
  };
  const s = text || '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '*') {
      flush();
      bold = !bold;
    } else if (ch === '_') {
      flush();
      accent = !accent;
    } else if (ch === '\n') {
      flush();
      tokens.push({ br: true });
    } else cur += ch;
  }
  flush();
  return tokens;
}

function cvWordWidth(ctx, tok, fs, allBold) {
  ctx.font =
    (tok.bold || allBold ? '700' : '400') +
    ' ' +
    fs +
    'px "IBM Plex Sans Arabic"';
  return ctx.measureText(tok.text).width;
}
function cvSpaceWidth(ctx, fs) {
  ctx.font = '400 ' + fs + 'px "IBM Plex Sans Arabic"';
  return ctx.measureText(' ').width || fs * 0.25;
}
function cvLineWidth(ctx, toks, fs, allBold) {
  if (!toks.length) return 0;
  let s = 0;
  toks.forEach((t) => (s += cvWordWidth(ctx, t, fs, allBold)));
  return s + cvSpaceWidth(ctx, fs) * (toks.length - 1);
}
function cvWrapTokens(ctx, tokens, boxW, maxFont, minFont, allBold, maxLines) {
  const shortRatio = 0.6,
    LEAD = 1.42;
  if (tokens.some((t) => t.br)) {
    const manual = [];
    let cur = [];
    tokens.forEach((t) => {
      if (t.br) {
        manual.push(cur);
        cur = [];
      } else cur.push(t);
    });
    manual.push(cur);
    const lines = manual.filter((l) => l.length);
    for (let fs = maxFont; fs >= minFont; fs -= 2) {
      if (lines.every((l) => cvLineWidth(ctx, l, fs, allBold) <= boxW))
        return { fs, lines, lh: Math.round(fs * LEAD) };
    }
    return { fs: minFont, lines, lh: Math.round(minFont * LEAD) };
  }
  const build = (fs) => {
    const lines = [];
    let cur = [],
      li = 0;
    const limit = () => (li % 2 === 0 ? boxW : boxW * shortRatio);
    tokens.forEach((tk) => {
      const test = cur.concat(tk);
      if (!cur.length || cvLineWidth(ctx, test, fs, allBold) <= limit())
        cur = test;
      else {
        lines.push(cur);
        cur = [tk];
        li++;
      }
    });
    if (cur.length) lines.push(cur);
    return lines;
  };
  for (let fs = maxFont; fs >= minFont; fs -= 2) {
    const lines = build(fs);
    if (lines.length <= maxLines)
      return { fs, lines, lh: Math.round(fs * LEAD) };
  }
  return {
    fs: minFont,
    lines: build(minFont),
    lh: Math.round(minFont * LEAD),
  };
}
/* eslint-enable */

// ── إعداد ctx مطابق ─────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FONTS_DIR = join(ROOT, 'assets/fonts');
FontLibrary.use('IBM Plex Sans Arabic', [
  join(FONTS_DIR, 'IBMPlexSansArabic-Light.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Regular.ttf'),
  join(FONTS_DIR, 'IBMPlexSansArabic-Bold.ttf'),
]);

const canvas = new Canvas(1080, 1350);
const ctx = canvas.getContext('2d');

// ── النص والمعاملات المُشتكى منها ────────────────────

const TEXT =
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';
const BOX_W = 900;
const MAX_FS = 80;
const MIN_FS = 44;
const MAX_LINES = 6;
const SHORT_RATIO = 0.6;
const LEAD = 1.42;

// ── تشغيل الأصل ─────────────────────────────────────

const origTokens = cvParseTokens(TEXT);
const origResult = cvWrapTokens(
  ctx,
  origTokens,
  BOX_W,
  MAX_FS,
  MIN_FS,
  false,
  MAX_LINES
);

// ── تشغيل المنقول ───────────────────────────────────

const portedTokens = parseTokens(TEXT);
const measure = createCanvasMeasurer(ctx, DEFAULT_BRAND);
const portedResult = wrapAlternating(
  portedTokens,
  BOX_W,
  MAX_FS,
  MIN_FS,
  false,
  MAX_LINES,
  SHORT_RATIO,
  LEAD,
  measure
);

// ── مقارنة ──────────────────────────────────────────

const asText = (r, key) =>
  (key === 'orig' ? r.lines : r.lines).map((ln) =>
    ln.map((t) => t.text).join(' ')
  );

const origLines = asText(origResult, 'orig');
const portedLines = asText(portedResult, 'ported');

console.log('── الأصل (cvWrapTokens) ──');
console.log(`fs=${origResult.fs}, lh=${origResult.lh}, أسطر=${origLines.length}`);
origLines.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));

console.log('\n── المنقول (wrapAlternating) ──');
console.log(
  `fs=${portedResult.fontSize}, lh=${portedResult.lineHeight}, أسطر=${portedLines.length}`
);
portedLines.forEach((l, i) => console.log(`  ${i + 1}. ${l}`));

// ── التأكيد ─────────────────────────────────────────

const same =
  origResult.fs === portedResult.fontSize &&
  origResult.lh === portedResult.lineHeight &&
  origLines.length === portedLines.length &&
  origLines.every((l, i) => l === portedLines[i]);

console.log('\n── الحكم ──');
if (same) {
  console.log('✓ تطابق حرفي: النقل أمين. النمط المرصود = نمط الأصل نفسه.');
  process.exit(0);
} else {
  console.log('✗ اختلاف: انحدار في النقل. يجب الإصلاح.');
  process.exit(1);
}
