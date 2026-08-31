// validate — تحقق مدخلات مهمة الرندر **قبل** الطابور.
//
// **العقد (docs/08):** التحقق يحدث في نقطة الدخول (API/CLI/enqueue) لا
// داخل العامل. مهمة معطوبة لا تدخل Redis أصلاً، فلا تشغل عاملاً ولا
// تحجب الطابور. عزل الفشل يبدأ هنا.
//
// **يرمي:** `RenderJobValidationError` مع سبب واضح. مسؤولية المستدعي
// (API layer) تحويلها إلى 4xx.

import type { BrandKit } from '@pf-mediakit/shared';
import type { Template } from '@pf-mediakit/templates';
import { TEMPLATES } from '@pf-mediakit/templates';
import { baseDurationForHeadline } from '@pf-mediakit/engine';

export class RenderJobValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`[${field}] ${message}`);
    this.name = 'RenderJobValidationError';
  }
}

const bail = (field: string, msg: string): never => {
  throw new RenderJobValidationError(field, msg);
};

// ── مدخلات مهمة الرندر ────────────────────────────────

/**
 * كل مهمة رندر تُقدَّم إلى الطابور. `tenantId` إلزامي لعزل الحصص
 * والفوترة. `brand` يُمرَّر ككائن جاهز (مُحلَّل عبر `resolveBrand`
 * قبل الاستدعاء) — لا نحمّل الملفات هنا.
 */
export interface RenderJobInput {
  readonly tenantId: string;
  readonly templateId: string;
  /**
   * BrandKit جاهز (مسطَّح عبر resolveBrand). نتحاشى ملفات JSON هنا —
   * التحقق من صحة brand.* مسؤولية طبقة أعلى.
   */
  readonly brand: BrandKit;
  readonly content: Readonly<Record<string, unknown>>;
  readonly size: { readonly w: number; readonly h: number };
  readonly outPath: string;
  readonly fps?: number;
}

// ── الحدود القاسية (docs/08) ─────────────────────────

/** أقصى مدة فيديو مسموحة (ثانية). فوقه ⇒ رفض قبل الطابور. */
export const MAX_VIDEO_DURATION_S = 90;

/** أدنى وأقصى أبعاد قماش معقولة — يمنع مقاسات مؤذية. */
const MIN_CANVAS = 320;
const MAX_CANVAS = 4096;

// ── الواجهة العامة ────────────────────────────────────

/**
 * يتحقق من المدخل ويعيده مصنَّفاً، أو يرمي `RenderJobValidationError`.
 * **لا يمسّ Redis** — يُستدعى قبل `queue.add`.
 *
 * الفحوص:
 *   • tenantId string غير فارغ
 *   • templateId في سجل TEMPLATES
 *   • القالب من نوع فيديو (`kind === 'video'` أو يحمل `video`)
 *   • size ضمن حدود آمنة
 *   • مدة الفيديو المتوقعة (من عدد كلمات headline) ≤ MAX_VIDEO_DURATION_S
 *   • outPath string غير فارغ
 *   • fps ضمن [1, 60] إن مُرِّر
 */
export function validateRenderJob(input: unknown): RenderJobInput {
  if (typeof input !== 'object' || input === null) {
    bail('root', 'input يجب أن يكون object');
  }
  const o = input as Record<string, unknown>;

  if (typeof o['tenantId'] !== 'string' || o['tenantId'].length === 0) {
    bail('tenantId', 'إلزامي — string غير فارغ');
  }

  if (typeof o['templateId'] !== 'string') {
    bail('templateId', 'إلزامي — string');
  }
  const template: Template | undefined = TEMPLATES[o['templateId'] as string];
  if (!template) {
    bail(
      'templateId',
      `غير معروف: ${o['templateId']} — المتاح: ${Object.keys(TEMPLATES).join(', ')}`
    );
  }

  // فرع الفيديو مطلوب — أو kind يسمح بذلك
  if (!template.video) {
    bail('templateId', `قالب "${template.id}" لا يحمل فرع video`);
  }

  if (typeof o['brand'] !== 'object' || o['brand'] === null) {
    bail('brand', 'يجب أن يكون BrandKit مُحلَّل');
  }
  const brand = o['brand'] as BrandKit;
  // فحص شكلي بسيط — تفصيلاً هو مسؤولية طبقة أعلى (API/upload)
  if (
    typeof brand.id !== 'string' ||
    typeof brand.motion !== 'object' ||
    typeof brand.motion.segmentMin !== 'number'
  ) {
    bail('brand', 'شكل BrandKit غير مُحلَّل — استدعِ resolveBrand أولاً');
  }

  if (typeof o['content'] !== 'object' || o['content'] === null) {
    bail('content', 'يجب أن يكون object');
  }
  const content = o['content'] as Record<string, unknown>;

  const size = o['size'];
  if (
    typeof size !== 'object' ||
    size === null ||
    typeof (size as { w?: unknown }).w !== 'number' ||
    typeof (size as { h?: unknown }).h !== 'number'
  ) {
    bail('size', 'يجب أن يكون {w:number, h:number}');
  }
  const { w, h } = size as { w: number; h: number };
  if (w < MIN_CANVAS || w > MAX_CANVAS || h < MIN_CANVAS || h > MAX_CANVAS) {
    bail('size', `الأبعاد يجب أن تكون في [${MIN_CANVAS}, ${MAX_CANVAS}]`);
  }

  if (typeof o['outPath'] !== 'string' || o['outPath'].length === 0) {
    bail('outPath', 'إلزامي — string غير فارغ');
  }

  if (o['fps'] !== undefined) {
    if (typeof o['fps'] !== 'number' || o['fps'] < 1 || o['fps'] > 60) {
      bail('fps', 'يجب أن يكون رقم في [1, 60]');
    }
  }

  // فحص المدة قبل الطابور — من عدد كلمات headline
  const headlineText =
    typeof content['headline'] === 'string' ? content['headline'] : '';
  const wordCount = headlineText.trim().split(/\s+/).filter(Boolean).length;
  const projectedBaseDur = baseDurationForHeadline(brand, wordCount);
  const outroDur = brand.motion.outro;
  const projectedTotal = projectedBaseDur + outroDur;
  if (projectedTotal > MAX_VIDEO_DURATION_S) {
    bail(
      'content.headline',
      `المدة المتوقعة ${projectedTotal.toFixed(1)}s > الحد ${MAX_VIDEO_DURATION_S}s`
    );
  }

  return {
    tenantId: o['tenantId'] as string,
    templateId: o['templateId'] as string,
    brand,
    content,
    size: { w, h },
    outPath: o['outPath'] as string,
    ...(o['fps'] !== undefined && { fps: o['fps'] as number }),
  };
}
