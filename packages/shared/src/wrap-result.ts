// WrapResult — docs/05-engine-api.md §«طبقة النص».
// الأصل في الكود القديم استعمل { fs, lines, lh }.
// المواصفة أعادت التسمية إلى fontSize و lineHeight — نلتزم بها.

import type { Token } from './token.js';

export interface WrapResult {
  readonly fontSize: number;
  readonly lines: readonly (readonly Token[])[];
  readonly lineHeight: number;
}
