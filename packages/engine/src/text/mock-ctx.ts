// Mock CanvasDrawContext للاختبارات — يسجّل كل استدعاء رسم بحالته
// وقت النداء (font, fillStyle, alignment، إلخ) بلا Canvas حقيقي.
//
// يغطّي كل السطح المُعلَن في `CanvasDrawContext` (draw-line.ts):
// نص، مضلعات، مسارات، صور، تدرّجات، حالة. حسم D-05.

import type {
  CanvasDrawContext,
  CanvasGradientLike,
  ImageLike,
} from './draw-line.js';

// ── أنواع العمليات المسجَّلة ───────────────────────────

export interface FillTextOp {
  readonly type: 'fillText';
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly fillStyle: string | CanvasGradientLike;
  readonly textAlign: string;
  readonly direction: string;
  readonly textBaseline: string;
}

export interface FillRectOp {
  readonly type: 'fillRect';
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly fillStyle: string | CanvasGradientLike;
  readonly globalAlpha: number;
}

export interface DrawImageOp {
  readonly type: 'drawImage';
  readonly image: ImageLike;
  readonly args: readonly number[];
  readonly globalAlpha: number;
  readonly imageSmoothingEnabled: boolean;
  readonly imageSmoothingQuality: 'low' | 'medium' | 'high';
}

export interface FillPathOp {
  readonly type: 'fill';
  readonly path: readonly PathCommand[];
  readonly fillStyle: string | CanvasGradientLike;
  readonly globalAlpha: number;
}

export type PathCommand =
  | { readonly kind: 'moveTo'; readonly x: number; readonly y: number }
  | { readonly kind: 'close' }
  | {
      readonly kind: 'arcTo';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly r: number;
    }
  | {
      readonly kind: 'roundRect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly r: number;
    };

export interface SaveOp {
  readonly type: 'save';
}
export interface RestoreOp {
  readonly type: 'restore';
}
export interface TranslateOp {
  readonly type: 'translate';
  readonly x: number;
  readonly y: number;
}
export interface ScaleOp {
  readonly type: 'scale';
  readonly sx: number;
  readonly sy: number;
}

export type CtxOp =
  | FillTextOp
  | FillRectOp
  | DrawImageOp
  | FillPathOp
  | SaveOp
  | RestoreOp
  | TranslateOp
  | ScaleOp;

// ── تدرّج زائف يسجّل نقاط التوقف ───────────────────────

export interface RecordedStop {
  readonly offset: number;
  readonly color: string;
}

export interface RecordedGradient extends CanvasGradientLike {
  readonly type: 'linear';
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly stops: readonly RecordedStop[];
}

const createRecordedGradient = (
  x0: number,
  y0: number,
  x1: number,
  y1: number
): RecordedGradient => {
  const stops: RecordedStop[] = [];
  const grad: RecordedGradient = {
    type: 'linear',
    x0,
    y0,
    x1,
    y1,
    get stops(): readonly RecordedStop[] {
      return stops;
    },
    addColorStop(offset: number, color: string): void {
      stops.push({ offset, color });
    },
  };
  return grad;
};

// ── واجهة MockCtx ──────────────────────────────────────

export interface MockCtx extends CanvasDrawContext {
  readonly ops: readonly CtxOp[];
  /** ألياس تاريخي — نفس المصفوفة، لكن مفلترة على fillText. */
  readonly fillTextCalls: readonly FillTextOp[];
  readonly fillRectCalls: readonly FillRectOp[];
  readonly drawImageCalls: readonly DrawImageOp[];
  readonly fillPathCalls: readonly FillPathOp[];
}

/**
 * ينشئ mock ctx يسجّل عمليات الرسم مع حالتها اللحظية.
 *
 * `ops` تعرض كل النداءات بترتيبها. مجموعات فرعية (`fillTextCalls`،
 * إلخ) لتسهيل التأكيدات. الحالة (`fillStyle`, `globalAlpha`, …)
 * تُنسخ داخل كل عملية عند نداء الرسم.
 */
export function createMockCtx(): MockCtx {
  const ops: CtxOp[] = [];
  const state = {
    font: '',
    fillStyle: '' as string | CanvasGradientLike,
    textAlign: '',
    direction: '',
    textBaseline: '',
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high' as 'low' | 'medium' | 'high',
  };

  // مسار نشط (بين beginPath/fill).
  let currentPath: PathCommand[] = [];

  const ctx: MockCtx = {
    // ── نص ─────────────────────────────
    get font(): string {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get fillStyle(): string | CanvasGradientLike {
      return state.fillStyle;
    },
    set fillStyle(v: string | CanvasGradientLike) {
      state.fillStyle = v;
    },
    get textAlign(): string {
      return state.textAlign;
    },
    set textAlign(v: string) {
      state.textAlign = v;
    },
    get direction(): string {
      return state.direction;
    },
    set direction(v: string) {
      state.direction = v;
    },
    get textBaseline(): string {
      return state.textBaseline;
    },
    set textBaseline(v: string) {
      state.textBaseline = v;
    },
    fillText(text: string, x: number, y: number): void {
      ops.push({
        type: 'fillText',
        text,
        x,
        y,
        font: state.font,
        fillStyle: state.fillStyle,
        textAlign: state.textAlign,
        direction: state.direction,
        textBaseline: state.textBaseline,
      });
    },
    measureText(text: string): { readonly width: number } {
      // قياس اصطناعي بسيط — mock ctx لا يُعتمد كمصدر قياس أساسي؛
      // Measurer منفصل يُحقن للتخطيط. مفيد فقط لطبقات ترسم نصاً قصيراً
      // (مثل الشارة) وتحتاج عرض التسمية.
      return { width: text.length * 5 };
    },

    // ── مضلعات ─────────────────────────
    fillRect(x: number, y: number, w: number, h: number): void {
      ops.push({
        type: 'fillRect',
        x,
        y,
        w,
        h,
        fillStyle: state.fillStyle,
        globalAlpha: state.globalAlpha,
      });
    },

    // ── مسارات ─────────────────────────
    beginPath(): void {
      currentPath = [];
    },
    moveTo(x: number, y: number): void {
      currentPath.push({ kind: 'moveTo', x, y });
    },
    closePath(): void {
      currentPath.push({ kind: 'close' });
    },
    arcTo(x1: number, y1: number, x2: number, y2: number, r: number): void {
      currentPath.push({ kind: 'arcTo', x1, y1, x2, y2, r });
    },
    roundRect(x: number, y: number, w: number, h: number, r: number): void {
      currentPath.push({ kind: 'roundRect', x, y, w, h, r });
    },
    fill(): void {
      ops.push({
        type: 'fill',
        path: currentPath.slice(),
        fillStyle: state.fillStyle,
        globalAlpha: state.globalAlpha,
      });
    },

    // ── صور ────────────────────────────
    drawImage(image: ImageLike, ...args: number[]): void {
      ops.push({
        type: 'drawImage',
        image,
        args,
        globalAlpha: state.globalAlpha,
        imageSmoothingEnabled: state.imageSmoothingEnabled,
        imageSmoothingQuality: state.imageSmoothingQuality,
      });
    },
    get imageSmoothingEnabled(): boolean {
      return state.imageSmoothingEnabled;
    },
    set imageSmoothingEnabled(v: boolean) {
      state.imageSmoothingEnabled = v;
    },
    get imageSmoothingQuality(): 'low' | 'medium' | 'high' {
      return state.imageSmoothingQuality;
    },
    set imageSmoothingQuality(v: 'low' | 'medium' | 'high') {
      state.imageSmoothingQuality = v;
    },

    // ── تدرّجات ────────────────────────
    createLinearGradient(
      x0: number,
      y0: number,
      x1: number,
      y1: number
    ): CanvasGradientLike {
      return createRecordedGradient(x0, y0, x1, y1);
    },

    // ── حالة ───────────────────────────
    save(): void {
      ops.push({ type: 'save' });
    },
    restore(): void {
      ops.push({ type: 'restore' });
    },
    get globalAlpha(): number {
      return state.globalAlpha;
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v;
    },
    translate(x: number, y: number): void {
      ops.push({ type: 'translate', x, y });
    },
    scale(sx: number, sy: number): void {
      ops.push({ type: 'scale', sx, sy });
    },

    // ── ملخّصات للتأكيد ────────────────
    get ops(): readonly CtxOp[] {
      return ops;
    },
    get fillTextCalls(): readonly FillTextOp[] {
      return ops.filter((o): o is FillTextOp => o.type === 'fillText');
    },
    get fillRectCalls(): readonly FillRectOp[] {
      return ops.filter((o): o is FillRectOp => o.type === 'fillRect');
    },
    get drawImageCalls(): readonly DrawImageOp[] {
      return ops.filter((o): o is DrawImageOp => o.type === 'drawImage');
    },
    get fillPathCalls(): readonly FillPathOp[] {
      return ops.filter((o): o is FillPathOp => o.type === 'fill');
    },
  };

  return ctx;
}
