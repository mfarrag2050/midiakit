// أنواع محلّية للمكاتب التي لا تصدر declarations.
// مصدر التنقيح: مراجعة الشيفرة العامة للمكتبتَين.

declare module 'svg-parser' {
  export interface SvgAstNode {
    type: 'element' | 'text';
    tagName?: string;
    properties?: Record<string, string | number | undefined>;
    children?: (SvgAstNode | { type: 'text'; value: string })[];
    value?: string;
  }
  export interface SvgAstRoot {
    type: 'root';
    children: SvgAstNode[];
  }
  export function parse(source: string): SvgAstRoot;
}

declare module 'svg-arc-to-cubic-bezier' {
  export interface ArcParams {
    px: number;
    py: number;
    cx: number;
    cy: number;
    rx: number;
    ry: number;
    xAxisRotation: number;
    largeArcFlag: boolean;
    sweepFlag: boolean;
  }
  export interface BezierSegment {
    x1: number; y1: number;
    x2: number; y2: number;
    x: number; y: number;
  }
  const arcToBezier: (params: ArcParams) => BezierSegment[];
  export default arcToBezier;
}
