/**
 * رموز الأخطاء الموحّدة — docs/16 §1.4 (UPPER_SNAKE، مفاتيح لا نصوص L-22).
 *
 * كل خطأ يُرمى بـApiError مع رمز ثابت. الواجهة تُترجم الرمز إلى نصّ
 * حسب locale.
 */

export type ErrorCode =
  // Auth (§2)
  | 'INVALID_CREDENTIALS'          // بريد أو كلمة سر خاطئة (رسالة موحّدة لا تكشف)
  | 'ACCOUNT_DISABLED'             // is_active=false
  | 'TOKEN_EXPIRED'                // JWT exp انقضى
  | 'TOKEN_INVALID'                // توقيع/تنسيق/iss/aud غير صحيح
  | 'SESSION_REVOKED'              // JWT صالح لكن الجلسة مُبطلة
  | 'REFRESH_TOKEN_INVALID'        // refresh token غير معروف/مُستهلَك
  | 'PASSWORD_TOO_WEAK'            // < 12 حرف
  | 'EMAIL_INVALID'
  | 'EMAIL_TAKEN'
  | 'RESET_TOKEN_EXPIRED'
  | 'RESET_TOKEN_USED'
  | 'RESET_TOKEN_INVALID'
  // Rate limit
  | 'TOO_MANY_ATTEMPTS'
  // Generic
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;      // مفتاح i18n مطابق للـcode
  field?: string | null;
  requestId?: string;
}

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly field: string | null;

  constructor(code: ErrorCode, httpStatus: number, field: string | null = null) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
    this.field = field;
  }

  toBody(requestId?: string): { error: ApiErrorBody } {
    return {
      error: {
        code: this.code,
        message: this.code,   // مفتاح i18n — الواجهة تُترجم
        field: this.field,
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}

// اختصارات
export const InvalidCredentials = () => new ApiError('INVALID_CREDENTIALS', 401);
export const AccountDisabled = () => new ApiError('ACCOUNT_DISABLED', 403);
export const TokenExpired = () => new ApiError('TOKEN_EXPIRED', 401);
export const TokenInvalid = () => new ApiError('TOKEN_INVALID', 401);
export const SessionRevoked = () => new ApiError('SESSION_REVOKED', 401);
export const RefreshTokenInvalid = () => new ApiError('REFRESH_TOKEN_INVALID', 401);
export const PasswordTooWeak = () => new ApiError('PASSWORD_TOO_WEAK', 400, 'password');
export const EmailInvalid = () => new ApiError('EMAIL_INVALID', 400, 'email');
export const EmailTaken = () => new ApiError('EMAIL_TAKEN', 409, 'email');
export const ResetTokenExpired = () => new ApiError('RESET_TOKEN_EXPIRED', 400);
export const ResetTokenUsed = () => new ApiError('RESET_TOKEN_USED', 400);
export const ResetTokenInvalid = () => new ApiError('RESET_TOKEN_INVALID', 400);
export const TooManyAttempts = () => new ApiError('TOO_MANY_ATTEMPTS', 429);
export const Unauthorized = () => new ApiError('UNAUTHORIZED', 401);
