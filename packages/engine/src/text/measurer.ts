// Measurer — docs/05-engine-api.md §«طبقة النص».
// يجمع cvWordWidth (1782) + cvSpaceWidth (1783) + cvLineWidth (1786)
// من reference/aa-media-kit.html في كائن يحمل ctx و brand — بلا متغير عام.
//
// واجهة قابلة للحقن:
//   • Canvas في الإنتاج (createCanvasMeasurer)
//   • قياس صناعي بسيط في الاختبار (لا حاجة لمتصفح)

import type { BrandKit, Token } from '@pf-mediakit/shared';
import { isBreak } from '@pf-mediakit/shared';

/**
 * واجهة القياس. تُمرَّر إلى wrapAlternating و layoutBalanced،
 * فتخرج دوال التخطيط من الحالة العامة.
 */
export interface Measurer {
  word(tok: Token, fs: number, allBold: boolean): number;
  space(fs: number): number;
  line(toks: readonly Token[], fs: number, allBold: boolean): number;
}

// ── قياس Canvas (المتصفح + skia-canvas) ──────────────────

/** الحد الأدنى من واجهة Canvas الذي نحتاجه — لا نستورد lib.dom. */
export interface CanvasFontContext {
  font: string;
  measureText(text: string): { width: number };
}

/**
 * ينتج Measurer يستخدم ctx.measureText.
 * يستقرأ أسماء أسرة الخط من brand.fonts.primary.family (+ fallback).
 */
export function createCanvasMeasurer(
  ctx: CanvasFontContext,
  brand: BrandKit
): Measurer {
  const family = `"${brand.fonts.primary.family}", ${brand.fonts.fallback}`;

  const setFont = (fs: number, bold: boolean): void => {
    ctx.font = `${bold ? '700' : '400'} ${fs}px ${family}`;
  };

  const word = (tok: Token, fs: number, allBold: boolean): number => {
    if (isBreak(tok)) return 0;
    setFont(fs, tok.bold || allBold);
    return ctx.measureText(tok.text).width;
  };

  const space = (fs: number): number => {
    setFont(fs, false);
    const w = ctx.measureText(' ').width;
    return w || fs * 0.25;
  };

  const line = (
    toks: readonly Token[],
    fs: number,
    allBold: boolean
  ): number => {
    if (toks.length === 0) return 0;
    let sum = 0;
    for (const t of toks) sum += word(t, fs, allBold);
    return sum + space(fs) * (toks.length - 1);
  };

  return { word, space, line };
}

// ── قياس صناعي (اختبارات + عقد رياضي مستقر) ────────────

export interface SyntheticMeasureOptions {
  /** عرض الكلمة = حروف × charWidth × fs. الافتراضي 0.5. */
  readonly charWidth?: number;
  /** عرض المسافة كنسبة من fs. الافتراضي 0.25 (يطابق مخرج الأصل عندما ctx.measureText يعيد صفراً). */
  readonly spaceRatio?: number;
  /** معامل bold: كم يزيد العرض عندما tok.bold أو allBold. الافتراضي 1.2. */
  readonly boldFactor?: number;
}

/**
 * Measurer اصطناعي حتمي — لا يعتمد على أي بيئة رسم.
 * يجعل الاختبارات قابلة للتنفيذ في Node بلا Canvas.
 *
 * قواعده:
 *   • عرض الكلمة = عدد نقاط رمز النص × charWidth × fs (× boldFactor إن كانت عريضة)
 *   • عرض المسافة = spaceRatio × fs
 *   • عرض السطر = مجموع الكلمات + مسافات (n-1)
 */
export function createSyntheticMeasurer(
  opts: SyntheticMeasureOptions = {}
): Measurer {
  const charWidth = opts.charWidth ?? 0.5;
  const spaceRatio = opts.spaceRatio ?? 0.25;
  const boldFactor = opts.boldFactor ?? 1.2;

  // Intl.Segmenter يعطي عرضاً صحيحاً للحروف المركّبة (كثيرة في العربية).
  // بلا كسر التطبيق يبقى مقبولاً في اختباراتنا، لكنه أدق.
  const graphemeCount = (s: string): number => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Seg = (Intl as unknown as { Segmenter?: unknown }).Segmenter;
    if (typeof Seg === 'function') {
      // @ts-expect-error - runtime feature test
      const it = new Seg('ar', { granularity: 'grapheme' }).segment(s);
      let n = 0;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for (const _ of it) n++;
      return n;
    }
    return [...s].length;
  };

  const word = (tok: Token, fs: number, allBold: boolean): number => {
    if (isBreak(tok)) return 0;
    const factor = tok.bold || allBold ? boldFactor : 1;
    return graphemeCount(tok.text) * charWidth * fs * factor;
  };

  const space = (fs: number): number => spaceRatio * fs;

  const line = (
    toks: readonly Token[],
    fs: number,
    allBold: boolean
  ): number => {
    if (toks.length === 0) return 0;
    let sum = 0;
    for (const t of toks) sum += word(t, fs, allBold);
    return sum + space(fs) * (toks.length - 1);
  };

  return { word, space, line };
}
