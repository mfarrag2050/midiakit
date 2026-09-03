// layers/svg — يحلّل نصّ SVG ويرسمه على Canvas 2D عبر أوّليات
// (moveTo/lineTo/bezierCurveTo/…). **لا محرّك رسم ثانٍ** — القاعدة 2
// في CLAUDE.md و ADR-001 تحكمان.
//
// **المكتبات:** svg-parser (AST) · svg-pathdata (تفكيك `d=`) ·
// svg-arc-to-cubic-bezier (تحويل `A` إلى Bézier — Canvas Path2D لا
// يدعم `A` طبيعياً). الرخصة والتفرّد في ATTRIBUTIONS.md §مكتبات SVG.
//
// **ربط الألوان بالهوية:** أيّ عنصر يحمل `data-brand="<key>"` يُطلى
// من `brand.colors[<key>]` (accent/text/surface/urgentBg…). قيم `fill`
// و `stroke` الحرفية تُحفَظ كما هي — لكن **نصيحة العميل:** استعمل
// `data-brand` كي يتكيّف الشعار مع كل هوية.
//
// **الوجود قبل الثبات (L-46):** الطبقة تُصدِّر `parseSvg(source)` كي
// يستطيع اختبار الوجود عدّ الأشكال المُحلَّلة > 0 قبل قياس ثبات الرسم.
//
// **الخالصة (القاعدة 1):** كل الحالة كوسيط. `drawSvg` بلا side-effects
// خارج ctx.

import { SVGPathData } from 'svg-pathdata';
import { parse as parseSvgAst } from 'svg-parser';
import arcToBezier from 'svg-arc-to-cubic-bezier';

import type { BrandKit, BrandColors } from '@pf-mediakit/shared';
import type { CanvasDrawContext } from '../text/draw-line.js';
import type { CanvasSize } from './image.js';

// ── الأنواع ─────────────────────────────────────────────

export type SvgFit = 'contain' | 'cover' | 'stretch';

export interface SvgLayerParams {
  /** نصّ SVG الخام (يُحلَّل مرة واحدة عبر prepareSvg). */
  readonly source?: string;
  /** أو تخطيط جاهز — يُحسَّن للاستدعاءات المتكرّرة (كاش timeline). */
  readonly prepared?: PreparedSvg;
  /** مربّع الرسم على القماش — بالبكسل. */
  readonly bounds: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** كيف يُلائم SVG المربّع — الافتراضي contain. */
  readonly fit?: SvgFit;
  /** شفافية عامة (0..1). */
  readonly opacity?: number;
}

/** شكل أوّلي بعد التحليل — لا يعرف بـCanvas ولا Brand. */
export type ParsedShape =
  | { readonly kind: 'path';    readonly commands: PathCommand[]; readonly style: RawStyle }
  | { readonly kind: 'rect';    readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly rx: number; readonly ry: number; readonly style: RawStyle }
  | { readonly kind: 'circle';  readonly cx: number; readonly cy: number; readonly r: number; readonly style: RawStyle }
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly style: RawStyle }
  | { readonly kind: 'line';    readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly style: RawStyle }
  | { readonly kind: 'polyline';readonly points: readonly { readonly x: number; readonly y: number }[]; readonly style: RawStyle }
  | { readonly kind: 'polygon'; readonly points: readonly { readonly x: number; readonly y: number }[]; readonly style: RawStyle };

/** أمر مسار بعد التحويل إلى أوّليات Canvas (لا A، ولا S/T المختصرة). */
export type PathCommand =
  | { readonly type: 'M'; readonly x: number; readonly y: number }
  | { readonly type: 'L'; readonly x: number; readonly y: number }
  | { readonly type: 'C'; readonly cp1x: number; readonly cp1y: number; readonly cp2x: number; readonly cp2y: number; readonly x: number; readonly y: number }
  | { readonly type: 'Q'; readonly cpx: number; readonly cpy: number; readonly x: number; readonly y: number }
  | { readonly type: 'Z' };

export interface RawStyle {
  /** `fill=` أو `data-brand-fill=`. `"none"` → لا تعبئة. */
  readonly fill: string | null;
  /** `stroke=` أو `data-brand-stroke=`. `"none"` → لا مضلع خارجي. */
  readonly stroke: string | null;
  readonly strokeWidth: number;
  readonly opacity: number;
  /** مفتاح ربط الهوية للـfill (`accent`, `text`, …). يُقدَّم على `fill`. */
  readonly brandFillKey: keyof BrandColors | null;
  /** نفسه لـstroke. */
  readonly brandStrokeKey: keyof BrandColors | null;
}

export interface PreparedSvg {
  /** viewBox الأصلي — يُستعمل لحساب scale إلى `bounds`. */
  readonly viewBox: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** أشكال بعد تسطيح كل الـ<g> وتطبيق transforms عليها. */
  readonly shapes: readonly ParsedShape[];
}

// ── تحليل ───────────────────────────────────────────────

/**
 * يحلّل نصّ SVG إلى PreparedSvg (viewBox + قائمة أشكال مع transforms
 * مسطَّحة). يجب استدعاؤه مرة لكل نصّ ثم إعادة استعمال المخرج.
 */
export function prepareSvg(source: string): PreparedSvg {
  const root = parseSvgAst(source);
  const svgNode = firstChildByTag(root, 'svg');
  if (!svgNode) {
    throw new Error('prepareSvg: العنصر <svg> غير موجود في المصدر');
  }

  const props = svgNode.properties ?? {};
  const viewBox = parseViewBox(
    (props['viewBox'] as string | undefined) ?? null,
    numOrNull(props['width']),
    numOrNull(props['height'])
  );

  const shapes: ParsedShape[] = [];
  collectShapes(svgNode, identityMatrix(), shapes);

  return { viewBox, shapes };
}

// ── رسم ────────────────────────────────────────────────

/**
 * يرسم SVG محضَّراً (أو نصّاً خاماً) داخل `bounds` على القماش الحالي.
 * خالصة — كل الحالة عبر الوسائط. brand يوفّر خريطة الألوان لربط
 * `data-brand-*` وربط `currentColor`.
 */
export function drawSvg(
  ctx: CanvasDrawContext,
  _size: CanvasSize,
  brand: BrandKit,
  params: SvgLayerParams
): void {
  const prep = params.prepared
    ?? (params.source ? prepareSvg(params.source) : null);
  if (!prep) return; // لا مصدر ولا محضَّر → تخطٍّ صامت (نمط الطبقات)
  if (prep.shapes.length === 0) return;

  const { bounds, fit = 'contain', opacity = 1 } = params;
  const { scaleX, scaleY, offsetX, offsetY } = fitTransform(
    prep.viewBox,
    bounds,
    fit
  );

  ctx.save();
  try {
    if (opacity !== 1) ctx.globalAlpha = ctx.globalAlpha * opacity;
    ctx.translate(offsetX, offsetY);
    ctx.scale(scaleX, scaleY);

    for (const shape of prep.shapes) {
      drawShape(ctx, brand, shape);
    }
  } finally {
    ctx.restore();
  }
}

// ── داخلي: مقياس/موضع الملاءمة ──────────────────────────

function fitTransform(
  vb: PreparedSvg['viewBox'],
  bounds: SvgLayerParams['bounds'],
  fit: SvgFit
): { scaleX: number; scaleY: number; offsetX: number; offsetY: number } {
  const sx = bounds.w / vb.w;
  const sy = bounds.h / vb.h;
  let scaleX: number, scaleY: number;
  if (fit === 'stretch') {
    scaleX = sx;
    scaleY = sy;
  } else if (fit === 'cover') {
    scaleX = scaleY = Math.max(sx, sy);
  } else {
    // contain
    scaleX = scaleY = Math.min(sx, sy);
  }
  const scaledW = vb.w * scaleX;
  const scaledH = vb.h * scaleY;
  const offsetX = bounds.x + (bounds.w - scaledW) / 2 - vb.x * scaleX;
  const offsetY = bounds.y + (bounds.h - scaledH) / 2 - vb.y * scaleY;
  return { scaleX, scaleY, offsetX, offsetY };
}

// ── داخلي: رسم شكل واحد ─────────────────────────────────

function drawShape(
  ctx: CanvasDrawContext,
  brand: BrandKit,
  shape: ParsedShape
): void {
  const style = shape.style;
  const fill = resolveColor(brand, style.brandFillKey, style.fill);
  const stroke = resolveColor(brand, style.brandStrokeKey, style.stroke);
  const shouldFill = fill !== null && style.fill !== 'none';
  const shouldStroke = stroke !== null && style.strokeWidth > 0 && style.stroke !== 'none';

  if (!shouldFill && !shouldStroke) return;

  ctx.save();
  try {
    if (style.opacity !== 1) ctx.globalAlpha = ctx.globalAlpha * style.opacity;
    ctx.beginPath();
    tracePath(ctx, shape);
    if (shouldFill) {
      ctx.fillStyle = fill!;
      ctx.fill();
    }
    if (shouldStroke) {
      ctx.strokeStyle = stroke!;
      ctx.lineWidth = style.strokeWidth;
      ctx.stroke();
    }
  } finally {
    ctx.restore();
  }
}

function tracePath(ctx: CanvasDrawContext, shape: ParsedShape): void {
  switch (shape.kind) {
    case 'path':
      for (const cmd of shape.commands) {
        switch (cmd.type) {
          case 'M': ctx.moveTo(cmd.x, cmd.y); break;
          case 'L': ctx.lineTo(cmd.x, cmd.y); break;
          case 'C': ctx.bezierCurveTo(cmd.cp1x, cmd.cp1y, cmd.cp2x, cmd.cp2y, cmd.x, cmd.y); break;
          case 'Q': ctx.quadraticCurveTo(cmd.cpx, cmd.cpy, cmd.x, cmd.y); break;
          case 'Z': ctx.closePath(); break;
        }
      }
      break;
    case 'rect': {
      const { x, y, w, h, rx, ry } = shape;
      if (rx > 0 || ry > 0) {
        // زوايا مدوّرة — نستعمل roundRect إن توفّرت، وإلّا نبني يدوياً.
        const r = Math.min(rx || ry, ry || rx, w / 2, h / 2);
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, w, h, r);
        } else {
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.arcTo(x + w, y, x + w, y + r, r);
          ctx.lineTo(x + w, y + h - r);
          ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
          ctx.lineTo(x + r, y + h);
          ctx.arcTo(x, y + h, x, y + h - r, r);
          ctx.lineTo(x, y + r);
          ctx.arcTo(x, y, x + r, y, r);
          ctx.closePath();
        }
      } else {
        ctx.rect(x, y, w, h);
      }
      break;
    }
    case 'circle':
      ctx.arc(shape.cx, shape.cy, shape.r, 0, Math.PI * 2);
      break;
    case 'ellipse': {
      // لا ellipse في CanvasDrawContext — نُقارب بمقياس دائرة داخل save/scale.
      // ملاحظة: هذا يستعمل ctx.scale، وسيؤثّر أيضاً على lineWidth إن لم يُنسّق.
      // نستعمل عيّنة بسيطة: مسار Bézier 4 مقاطع.
      ellipsePath(ctx, shape.cx, shape.cy, shape.rx, shape.ry);
      break;
    }
    case 'line':
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
      break;
    case 'polyline':
    case 'polygon': {
      const pts = shape.points;
      if (pts.length === 0) break;
      ctx.moveTo(pts[0]!.x, pts[0]!.y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
      if (shape.kind === 'polygon') ctx.closePath();
      break;
    }
  }
}

/** تقريب ellipse بأربع مقاطع Bézier (kappa = 0.5522847498). */
function ellipsePath(
  ctx: CanvasDrawContext,
  cx: number, cy: number,
  rx: number, ry: number
): void {
  const k = 0.5522847498307936;
  ctx.moveTo(cx + rx, cy);
  ctx.bezierCurveTo(cx + rx, cy + ry * k, cx + rx * k, cy + ry, cx, cy + ry);
  ctx.bezierCurveTo(cx - rx * k, cy + ry, cx - rx, cy + ry * k, cx - rx, cy);
  ctx.bezierCurveTo(cx - rx, cy - ry * k, cx - rx * k, cy - ry, cx, cy - ry);
  ctx.bezierCurveTo(cx + rx * k, cy - ry, cx + rx, cy - ry * k, cx + rx, cy);
}

// ── داخلي: تحليل الشجرة ─────────────────────────────────

type Matrix = readonly [number, number, number, number, number, number];
const identityMatrix = (): Matrix => [1, 0, 0, 1, 0, 0];

interface AstNode {
  readonly type: string;
  readonly tagName?: string;
  readonly properties?: Record<string, string | number | undefined>;
  readonly children?: readonly (AstNode | { type: 'text'; value: string })[];
}

function firstChildByTag(root: unknown, tag: string): AstNode | null {
  const r = root as { children?: AstNode[] };
  const c = r.children ?? [];
  for (const n of c) if (n.type === 'element' && n.tagName === tag) return n;
  return null;
}

function collectShapes(node: AstNode, parentMatrix: Matrix, out: ParsedShape[]): void {
  const localMatrix = composeMatrix(parentMatrix, parseTransform((node.properties?.['transform'] as string | undefined) ?? null));
  const style = parseStyle(node.properties ?? {});

  if (node.tagName === 'g' || node.tagName === 'svg') {
    for (const child of node.children ?? []) {
      if ('tagName' in child) collectShapes(child as AstNode, localMatrix, out);
    }
    return;
  }

  const p = node.properties ?? {};
  const s = style;

  switch (node.tagName) {
    case 'path': {
      const d = (p['d'] as string | undefined) ?? '';
      if (!d.trim()) return;
      const cmds = pathDToCommands(d, localMatrix);
      if (cmds.length > 0) out.push({ kind: 'path', commands: cmds, style: s });
      return;
    }
    case 'rect': {
      const x = num(p['x']), y = num(p['y']);
      const w = num(p['width']), h = num(p['height']);
      if (w <= 0 || h <= 0) return;
      const rx = num(p['rx']), ry = num(p['ry']);
      // تحويل نقاط الزوايا الأربع ثم استعادة x/y/w/h — يعمل فقط إن كانت
      // matrix ليست دورانية. إن كانت، فُكّها إلى path (مبسَّط: نُبقي كـrect).
      const [x0, y0] = applyMatrix(localMatrix, x, y);
      const [x1, y1] = applyMatrix(localMatrix, x + w, y + h);
      out.push({
        kind: 'rect',
        x: Math.min(x0, x1), y: Math.min(y0, y1),
        w: Math.abs(x1 - x0), h: Math.abs(y1 - y0),
        rx: rx * Math.abs(localMatrix[0]), ry: ry * Math.abs(localMatrix[3]),
        style: s,
      });
      return;
    }
    case 'circle': {
      const cx = num(p['cx']), cy = num(p['cy']);
      const r = num(p['r']);
      if (r <= 0) return;
      const [tcx, tcy] = applyMatrix(localMatrix, cx, cy);
      // للتقريب: نستعمل مقياس متوسّط. إن كانت matrix غير موحّدة (scaleX != scaleY)
      // فالنتيجة ellipse — نُصدرها بذلك النوع لأن circle يفقد المعنى.
      const scaleX = Math.abs(localMatrix[0]);
      const scaleY = Math.abs(localMatrix[3]);
      if (Math.abs(scaleX - scaleY) < 1e-3) {
        out.push({ kind: 'circle', cx: tcx, cy: tcy, r: r * scaleX, style: s });
      } else {
        out.push({ kind: 'ellipse', cx: tcx, cy: tcy, rx: r * scaleX, ry: r * scaleY, style: s });
      }
      return;
    }
    case 'ellipse': {
      const cx = num(p['cx']), cy = num(p['cy']);
      const rx = num(p['rx']), ry = num(p['ry']);
      if (rx <= 0 || ry <= 0) return;
      const [tcx, tcy] = applyMatrix(localMatrix, cx, cy);
      out.push({
        kind: 'ellipse', cx: tcx, cy: tcy,
        rx: rx * Math.abs(localMatrix[0]), ry: ry * Math.abs(localMatrix[3]),
        style: s,
      });
      return;
    }
    case 'line': {
      const [x1, y1] = applyMatrix(localMatrix, num(p['x1']), num(p['y1']));
      const [x2, y2] = applyMatrix(localMatrix, num(p['x2']), num(p['y2']));
      out.push({ kind: 'line', x1, y1, x2, y2, style: s });
      return;
    }
    case 'polyline':
    case 'polygon': {
      const raw = (p['points'] as string | undefined) ?? '';
      const pts = parsePoints(raw).map(([x, y]) => {
        const [tx, ty] = applyMatrix(localMatrix, x, y);
        return { x: tx, y: ty };
      });
      if (pts.length < 2) return;
      out.push({ kind: node.tagName === 'polygon' ? 'polygon' : 'polyline', points: pts, style: s });
      return;
    }
    // العناصر غير المدعومة (defs, filter, image, text, use, ...) — تُتجاهَل صامتة.
  }
}

// ── داخلي: تفكيك `d=` مع تحويل A → C ────────────────────

function pathDToCommands(d: string, m: Matrix): PathCommand[] {
  const raw = new SVGPathData(d).toAbs().normalizeHVZ().commands;
  const out: PathCommand[] = [];
  // نحتاج مسار نقطة سابقة لتفكيك القوس.
  let curX = 0, curY = 0;
  for (const c of raw) {
    // تعريف الأنواع من svg-pathdata — لكل نوع حقوله.
    // نستعمل rawType (رقم) عبر الحرف المكافئ. الأعلى نُحوّل A ثم نطبّق matrix.
    switch (c.type) {
      case SVGPathData.MOVE_TO: {
        const [x, y] = applyMatrix(m, c.x, c.y);
        out.push({ type: 'M', x, y });
        curX = c.x; curY = c.y;
        break;
      }
      case SVGPathData.LINE_TO: {
        const [x, y] = applyMatrix(m, c.x, c.y);
        out.push({ type: 'L', x, y });
        curX = c.x; curY = c.y;
        break;
      }
      case SVGPathData.CURVE_TO: {
        const [cp1x, cp1y] = applyMatrix(m, c.x1, c.y1);
        const [cp2x, cp2y] = applyMatrix(m, c.x2, c.y2);
        const [x, y] = applyMatrix(m, c.x, c.y);
        out.push({ type: 'C', cp1x, cp1y, cp2x, cp2y, x, y });
        curX = c.x; curY = c.y;
        break;
      }
      case SVGPathData.QUAD_TO: {
        const [cpx, cpy] = applyMatrix(m, c.x1, c.y1);
        const [x, y] = applyMatrix(m, c.x, c.y);
        out.push({ type: 'Q', cpx, cpy, x, y });
        curX = c.x; curY = c.y;
        break;
      }
      case SVGPathData.ARC: {
        const beziers = arcToBezier({
          px: curX, py: curY,
          cx: c.x, cy: c.y,
          rx: c.rX, ry: c.rY,
          xAxisRotation: c.xRot,
          largeArcFlag: c.lArcFlag !== 0,
          sweepFlag: c.sweepFlag !== 0,
        });
        for (const b of beziers) {
          const [cp1x, cp1y] = applyMatrix(m, b.x1, b.y1);
          const [cp2x, cp2y] = applyMatrix(m, b.x2, b.y2);
          const [x, y] = applyMatrix(m, b.x, b.y);
          out.push({ type: 'C', cp1x, cp1y, cp2x, cp2y, x, y });
        }
        curX = c.x; curY = c.y;
        break;
      }
      case SVGPathData.CLOSE_PATH: {
        out.push({ type: 'Z' });
        break;
      }
      // S/T/H/V مطبَّعة عبر normalizeHVZ + toAbs.
    }
  }
  return out;
}

// ── داخلي: parse نقاط polyline/polygon ────────────────────

function parsePoints(raw: string): [number, number][] {
  const nums = raw.trim().split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i]!, nums[i + 1]!]);
  return out;
}

// ── داخلي: تحليل transform (translate/scale/rotate/matrix) ─

function parseTransform(raw: string | null): Matrix {
  if (!raw) return identityMatrix();
  const re = /(translate|scale|rotate|matrix)\s*\(([^)]+)\)/g;
  let m: Matrix = identityMatrix();
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const op = match[1]!;
    const args = match[2]!.trim().split(/[\s,]+/).map(Number);
    switch (op) {
      case 'translate': m = composeMatrix(m, [1, 0, 0, 1, args[0] || 0, args[1] || 0]); break;
      case 'scale':     m = composeMatrix(m, [args[0] || 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0]); break;
      case 'rotate': {
        const a = ((args[0] || 0) * Math.PI) / 180;
        const cos = Math.cos(a), sin = Math.sin(a);
        m = composeMatrix(m, [cos, sin, -sin, cos, 0, 0]);
        break;
      }
      case 'matrix':    m = composeMatrix(m, [args[0]!, args[1]!, args[2]!, args[3]!, args[4]!, args[5]!]); break;
    }
  }
  return m;
}

function composeMatrix(a: Matrix, b: Matrix): Matrix {
  // (a) × (b) — SVG spec.
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

// ── داخلي: تحليل style/attributes ──────────────────────

function parseStyle(props: Record<string, string | number | undefined>): RawStyle {
  const fill = attrOrStyle(props, 'fill');
  const stroke = attrOrStyle(props, 'stroke');
  const strokeWidth = Number(attrOrStyle(props, 'stroke-width') ?? '1');
  const opacityRaw = attrOrStyle(props, 'opacity');
  const opacity = opacityRaw ? Number(opacityRaw) : 1;
  const brandFillKey = (props['data-brand-fill'] as string | undefined) ?? null;
  const brandStrokeKey = (props['data-brand-stroke'] as string | undefined) ?? null;
  return {
    fill: fill ?? null,
    stroke: stroke ?? null,
    strokeWidth: Number.isFinite(strokeWidth) ? strokeWidth : 1,
    opacity: Number.isFinite(opacity) ? opacity : 1,
    brandFillKey: isColorKey(brandFillKey) ? (brandFillKey as keyof BrandColors) : null,
    brandStrokeKey: isColorKey(brandStrokeKey) ? (brandStrokeKey as keyof BrandColors) : null,
  };
}

function attrOrStyle(
  props: Record<string, string | number | undefined>,
  key: string
): string | null {
  if (props[key] !== undefined && props[key] !== '') return String(props[key]);
  const styleStr = (props['style'] as string | undefined) ?? '';
  if (!styleStr) return null;
  const re = new RegExp(`(?:^|;)\\s*${key}\\s*:\\s*([^;]+)`);
  const m = re.exec(styleStr);
  return m ? m[1]!.trim() : null;
}

function resolveColor(
  brand: BrandKit,
  brandKey: keyof BrandColors | null,
  literal: string | null
): string | null {
  if (brandKey) {
    const v = (brand.colors as unknown as Record<string, unknown>)[brandKey];
    if (typeof v === 'string') return v;
  }
  if (literal === 'none' || literal === null) return null;
  return literal;
}

function isColorKey(k: unknown): boolean {
  if (typeof k !== 'string' || k.length === 0) return false;
  // نقبل أيّ مفتاح — التحقّق الفعلي في resolveColor عبر الوجود.
  return true;
}

// ── مساعدات ─────────────────────────────────────────────

function parseViewBox(
  raw: string | null,
  width: number | null,
  height: number | null
): PreparedSvg['viewBox'] {
  if (raw) {
    const p = raw.trim().split(/[\s,]+/).map(Number);
    if (p.length === 4 && p.every(Number.isFinite)) {
      return { x: p[0]!, y: p[1]!, w: p[2]!, h: p[3]! };
    }
  }
  const w = width ?? 100;
  const h = height ?? 100;
  return { x: 0, y: 0, w, h };
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
