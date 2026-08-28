// Mock CanvasDrawContext للاختبارات — يسجّل كل استدعاء رسم
// بحالته الحالية (font, fillStyle, alignment). بلا Canvas حقيقي.

import type { CanvasDrawContext } from './draw-line.js';

export interface FillTextOp {
  readonly type: 'fillText';
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly font: string;
  readonly fillStyle: string;
  readonly textAlign: string;
  readonly direction: string;
  readonly textBaseline: string;
}

export interface MockCtx extends CanvasDrawContext {
  readonly ops: readonly FillTextOp[];
  readonly fillTextCalls: readonly FillTextOp[];
  measureText(text: string): { readonly width: number };
}

/**
 * ينشئ mock ctx يسجّل عمليات الرسم.
 * ops و fillTextCalls تعرضان نفس المصفوفة (كل نداء رسم = عملية).
 */
export function createMockCtx(): MockCtx {
  const ops: FillTextOp[] = [];
  const state = {
    font: '',
    fillStyle: '',
    textAlign: '',
    direction: '',
    textBaseline: '',
  };

  const ctx: MockCtx = {
    get font(): string {
      return state.font;
    },
    set font(v: string) {
      state.font = v;
    },
    get fillStyle(): string {
      return state.fillStyle;
    },
    set fillStyle(v: string) {
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
      // قياس اصطناعي بسيط — mock ctx لا يُستخدم كمصدر للقياس عادةً؛
      // نمرّر Measurer منفصلاً. هذا فقط لتلبية عقد الواجهة.
      return { width: text.length * 5 };
    },
    get ops(): readonly FillTextOp[] {
      return ops;
    },
    get fillTextCalls(): readonly FillTextOp[] {
      return ops;
    },
  };

  return ctx;
}
