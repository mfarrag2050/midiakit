// عقد الأخطاء — يفكّ الشكل الموحّد من `docs/16 §1.4`:
//   { error: { code, message, field, requestId } }
// **`message` مفتاح i18n لا نصّ** (L-22). طبقة العرض تترجمه، لا الخادم.
//
// **لا تُلقَ رسائل معدَّة للمستخدم من هذا الملف مطلقاً** — الرسالة
// تُفَسَّر عبر `useLocale().t(error.messageKey)`.

/** رموز أخطاء ثابتة من docs/16 — القائمة تنمو مع mk-api. */
export type ApiErrorCode =
  // 400 — تحقّق مدخلات
  | 'INVALID_EMAIL'
  | 'PASSWORD_TOO_WEAK'
  | 'TENANT_NAME_EMPTY'
  | 'INVALID_TIMESTAMP'
  | 'LIMIT_TOO_LARGE'
  | 'INVALID_FILTER_FIELD'
  | 'INVALID_RESET_TOKEN'
  | 'TOKEN_EXPIRED'
  // 401
  | 'INVALID_CREDENTIALS'
  | 'INVALID_REFRESH_TOKEN'
  | 'REFRESH_TOKEN_EXPIRED'
  | 'UNAUTHENTICATED'
  // 403
  | 'INSUFFICIENT_ROLE'
  | 'ACCOUNT_SUSPENDED'
  // 404
  | 'NOT_FOUND'
  // 409
  | 'EMAIL_TAKEN'
  | 'USER_ALREADY_MEMBER'
  | 'PENDING_INVITE_EXISTS'
  | 'LAST_OWNER'
  | 'CONFLICT'
  // 413
  | 'PAYLOAD_TOO_LARGE'
  // 422
  | 'SEATS_EXHAUSTED'
  | 'LICENSE_ACK_MUST_BE_TRUE'
  | 'LICENSE_ACK_REQUIRED'
  // 429
  | 'RATE_LIMITED'
  // 402
  | 'QUOTA_EXCEEDED_VIDEOS'
  | 'QUOTA_EXCEEDED_RENDERS'
  // 405
  | 'METHOD_NOT_ALLOWED'
  // 500 / شبكة
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'SERVICE_UNAVAILABLE'
  // خطأ لم يُصنَّف — يُترجم لمفتاح عام في الواجهة
  | 'UNKNOWN';

export interface ApiErrorShape {
  readonly code: ApiErrorCode | string;
  readonly messageKey: string;
  readonly field: string | null;
  readonly requestId: string | null;
  readonly status: number;
}

/**
 * الاستثناء الوحيد الذي يرفعه client. الواجهة تلتقطه وتترجم
 * `messageKey` عبر i18n. **لا تعرض `err.message` مباشرة** — سيظهر
 * مفتاح خام للمستخدم النهائي.
 */
export class ApiError extends Error implements ApiErrorShape {
  readonly code: ApiErrorCode | string;
  readonly messageKey: string;
  readonly field: string | null;
  readonly requestId: string | null;
  readonly status: number;

  constructor(shape: ApiErrorShape) {
    super(`[${shape.status}] ${shape.code}`);
    this.name = 'ApiError';
    this.code = shape.code;
    this.messageKey = shape.messageKey;
    this.field = shape.field;
    this.requestId = shape.requestId;
    this.status = shape.status;
  }
}

/** يبني ApiError من جسم استجابة الخادم (docs/16 §1.4). */
export function parseApiError(status: number, body: unknown): ApiError {
  if (
    body &&
    typeof body === 'object' &&
    'error' in body &&
    body.error &&
    typeof body.error === 'object'
  ) {
    const e = body.error as Record<string, unknown>;
    return new ApiError({
      code: typeof e.code === 'string' ? e.code : 'UNKNOWN',
      messageKey: typeof e.message === 'string' ? e.message : 'errors.UNKNOWN',
      field: typeof e.field === 'string' ? e.field : null,
      requestId: typeof e.requestId === 'string' ? e.requestId : null,
      status,
    });
  }
  return new ApiError({
    code: 'UNKNOWN',
    messageKey: 'errors.UNKNOWN',
    field: null,
    requestId: null,
    status,
  });
}
