// uploader — رفع مباشر إلى تخزين S3/R2 (أو MinIO في dev) عبر
// signed PUT URL. **مفصول عن src/api/client.ts عن قصد** (docs/16 §9.1):
//
// - لا يحمل Bearer (URL نفسه يحمل توقيع الوصول).
// - لا يمرّ بـsingle-flight refresh (413/403 من التخزين ليست انتهاء
//   جلسة مصادقة).
// - قد ينتهي انتهاء صلاحية الـURL في أثناء رفع طويل (403 من S3)
//   ⇒ نُبلغ المستدعي، وهو يعيد طلب upload-url ويستأنف.
//
// **قواعد ملزَمة (S8):**
// 1. حجم يتجاوز maxSizeBytes ⇒ يُرفض قبل بدء الرفع لا بعده.
// 2. فشل شبكة أو timeout ⇒ خطأ محدَّد مرمَّز (لا رسالة خام).
// 3. 403 من التخزين ⇒ خطأ محدَّد (`URL_EXPIRED`) يُخبر المستدعي بأن
//    الحلّ إعادة طلب upload-url — لا رسالة خطأ عامّة.

import { ApiError } from './errors';

export type UploadEventKind = 'start' | 'progress' | 'done' | 'error';

export interface UploadEvent {
  readonly kind: UploadEventKind;
  readonly loaded?: number;
  readonly total?: number;
  readonly error?: ApiError;
}

export interface UploadOptions {
  readonly uploadUrl: string;
  readonly file: File | Blob;
  readonly contentType: string;
  readonly maxSizeBytes: number;
  readonly onEvent?: (e: UploadEvent) => void;
}

function mkApiError(code: string, status: number): ApiError {
  return new ApiError({
    code,
    messageKey: `errors.${code}`,
    field: null,
    requestId: `req_upload_${Date.now().toString(36)}`,
    status,
  });
}

/**
 * يرفع ملفاً إلى signed PUT URL. XHR بدل fetch لأنه الوحيد الذي يعطي
 * onprogress في المتصفح (fetch stream progress غير مدعوم على uploads).
 * يعيد Promise يحلّ عند 2xx ويرفض بـApiError مرمَّز خلاف ذلك.
 */
export function uploadToSignedUrl(opts: UploadOptions): Promise<void> {
  // (1) فحص الحجم قبل بدء الرفع.
  if (opts.file.size > opts.maxSizeBytes) {
    const err = mkApiError('SIZE_TOO_LARGE', 413);
    opts.onEvent?.({ kind: 'error', error: err });
    return Promise.reject(err);
  }

  // mock URL: نحاكي تقدّم رفع بلا شبكة (S5-style للتطوير حين
  // NEXT_PUBLIC_API_MOCK=true).
  if (opts.uploadUrl.startsWith('mock://')) {
    return new Promise((resolve) => {
      const total = opts.file.size;
      opts.onEvent?.({ kind: 'start' });
      let loaded = 0;
      const step = Math.max(1, Math.floor(total / 5));
      const tick = (): void => {
        loaded = Math.min(loaded + step, total);
        opts.onEvent?.({ kind: 'progress', loaded, total });
        if (loaded < total) setTimeout(tick, 80);
        else {
          opts.onEvent?.({ kind: 'done' });
          resolve();
        }
      };
      setTimeout(tick, 80);
    });
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', opts.uploadUrl);
    xhr.setRequestHeader('content-type', opts.contentType);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        opts.onEvent?.({ kind: 'progress', loaded: e.loaded, total: e.total });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onEvent?.({ kind: 'done' });
        resolve();
      } else if (xhr.status === 403) {
        // (3) URL انتهت صلاحيته — سبب مُعلن.
        const err = mkApiError('URL_EXPIRED', 403);
        opts.onEvent?.({ kind: 'error', error: err });
        reject(err);
      } else if (xhr.status === 413) {
        const err = mkApiError('SIZE_TOO_LARGE', 413);
        opts.onEvent?.({ kind: 'error', error: err });
        reject(err);
      } else {
        const err = mkApiError('UPLOAD_FAILED', xhr.status);
        opts.onEvent?.({ kind: 'error', error: err });
        reject(err);
      }
    });

    xhr.addEventListener('error', () => {
      // (2) فشل شبكة — رمز مُعلن بلا رسالة خام.
      const err = mkApiError('NETWORK_ERROR', 0);
      opts.onEvent?.({ kind: 'error', error: err });
      reject(err);
    });

    xhr.addEventListener('abort', () => {
      const err = mkApiError('UPLOAD_ABORTED', 0);
      opts.onEvent?.({ kind: 'error', error: err });
      reject(err);
    });

    opts.onEvent?.({ kind: 'start' });
    xhr.send(opts.file);
  });
}

/** يحوّل bytes إلى نصّ قصير (KB/MB) — يستعمل في UI. */
export function bytesShort(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
