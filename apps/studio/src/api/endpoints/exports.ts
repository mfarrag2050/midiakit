// /v1/exports — سجلّ تصديرات المستأجر (200-EXPORT-HISTORY على mkapi).
// **الترقيم offset-based** كما يعيده الخادم (§1.5 غلاف موحَّد لكن
// `nextCursor: null` دائماً — قرار مقصود من mkapi). لا نستعمل
// `requestPage` لأنّها cursor-based · نتفصّل offset مباشرةً.

import { request } from '../client';

export type ExportStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface ExportRow {
  readonly id: string;
  readonly renderId: string;
  readonly userId: string | null;
  readonly brandKitId: string | null;
  readonly templateId: string | null;
  readonly size: string;
  readonly format: string;
  /** S3 key للملفّ · null قبل النجاح. لا رابط جاهز — يُطلَب عبر
   *  `renders.getOutput(renderId)` حين يضغط المستخدم «تنزيل». */
  readonly storageKey: string | null;
  readonly sizeBytes: string | null;
  readonly status: ExportStatus | string;
  readonly errorCode: string | null;
  readonly createdAt: string;
}

/** الاستجابة كما يعيدها mkapi تماماً — لا نُخفي ولا نخترع. */
export interface ExportsPage {
  readonly data: readonly ExportRow[];
  /** offset-based ⇒ null دائماً (§1.5 envelope-only compliance). */
  readonly nextCursor: null;
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly hasMore: boolean;
}

export function list(opts?: {
  readonly limit?: number;
  readonly offset?: number;
}): Promise<ExportsPage> {
  const query: Record<string, string | number> = {};
  if (opts?.limit !== undefined) query.limit = opts.limit;
  if (opts?.offset !== undefined) query.offset = opts.offset;
  return request<ExportsPage>('/v1/exports', { query });
}
