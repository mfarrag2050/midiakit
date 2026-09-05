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
  // Tenants (§3)
  | 'TENANT_NAME_EMPTY'
  // Users (§4)
  | 'USER_ALREADY_MEMBER'
  | 'PENDING_INVITE_EXISTS'
  | 'SEATS_EXHAUSTED'              // معلَن في §4.3، غير مُنفَّذ حتى A21
  | 'LAST_OWNER'
  | 'REASON_TOO_SHORT'
  | 'ACCOUNT_SUSPENDED'            // معلَن في §2.2، غير مُنفَّذ حتى A21
  // Brand Kits (§5)
  | 'INSUFFICIENT_ROLE'
  | 'BRAND_KIT_IN_USE'
  | 'LAST_BRAND_KIT'
  | 'IMMUTABLE_FIELD'                // محاولة تعديل حقل عبر PATCH ممنوع
  | 'LICENSE_ACK_MUST_BE_TRUE'
  | 'LICENSE_ACK_REQUIRED'
  | 'FONT_NOT_UPLOADED'
  | 'UNKNOWN_PLATFORM'
  | 'LOGO_MODE_NOT_OFFICIAL'
  | 'INVALID_VERSION_FORMAT'
  | 'VERSION_NOT_AVAILABLE'
  | 'DIFF_NOT_ACKNOWLEDGED'
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
        // A8-FIX 2026-09-05: مفتاح قاموس كامل بحسب L-22 (message = key، لا text).
        // الاستوديو يستدعي t('errors.INVALID_CREDENTIALS') — مفتاح خام
        // بلا بادئة يُعرض للمستخدم كنصّ. البادئة errors. تُشير للمترجم.
        message: `errors.${this.code}`,
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
export const NotFound = () => new ApiError('NOT_FOUND', 404);
export const InsufficientRole = () => new ApiError('INSUFFICIENT_ROLE', 403);
export const BrandKitInUse = () => new ApiError('BRAND_KIT_IN_USE', 409);
export const LastBrandKit = () => new ApiError('LAST_BRAND_KIT', 409);
export const ImmutableField = (field: string) => new ApiError('IMMUTABLE_FIELD', 400, field);
export const LicenseAckMustBeTrue = () => new ApiError('LICENSE_ACK_MUST_BE_TRUE', 422, 'licenseAck');
export const LicenseAckRequired = () => new ApiError('LICENSE_ACK_REQUIRED', 422);
export const FontNotUploaded = () => new ApiError('FONT_NOT_UPLOADED', 404);
export const UnknownPlatform = () => new ApiError('UNKNOWN_PLATFORM', 400, 'platform');
export const LogoModeNotOfficial = () => new ApiError('LOGO_MODE_NOT_OFFICIAL', 409);
export const InvalidVersionFormat = () => new ApiError('INVALID_VERSION_FORMAT', 400, 'targetVersion');
export const VersionNotAvailable = () => new ApiError('VERSION_NOT_AVAILABLE', 400, 'targetVersion');
export const DiffNotAcknowledged = () => new ApiError('DIFF_NOT_ACKNOWLEDGED', 409, 'acknowledgedDiff');
export const TenantNameEmpty = () => new ApiError('TENANT_NAME_EMPTY', 400, 'name');
// Users (§4)
export const UserAlreadyMember = () => new ApiError('USER_ALREADY_MEMBER', 409, 'email');
export const PendingInviteExists = () => new ApiError('PENDING_INVITE_EXISTS', 409, 'email');
export const LastOwner = () => new ApiError('LAST_OWNER', 409);
export const ReasonTooShort = () => new ApiError('REASON_TOO_SHORT', 400, 'reason');
