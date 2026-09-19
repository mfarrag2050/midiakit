/**
 * emailer — طبقة إرسال البريد (رموز استعادة، دعوات).
 *
 * الحالة الحالية (2026-09-04):
 *   • في production: SMTP إلزامي (config.ts يفشل التشغيل إن لم يُضبط)،
 *     لكن التنفيذ الفعلي عبر nodemailer/similar بند لاحق. الآن نرمي
 *     خطأ صريح إن حاول أحد الإرسال بلا مزوّد.
 *   • في dev/test: نطبع في السجل مع تحذير واضح.
 *
 * تجريد Emailer يسمح بحقن مزوّد حقيقي حين يُبنى بلا لمس الـcallers.
 */
import type { Config } from './config.js';

export interface Emailer {
  send(params: { to: string; subject: string; body: string }): Promise<void>;
}

class DevConsoleEmailer implements Emailer {
  async send(params: { to: string; subject: string; body: string }): Promise<void> {
    // 400 §٢ · حماية زائدة صريحة — الفئة لا تُنشَأ في production أصلاً،
    // لكن نتحقّق ثانيةً قبل الطباعة كي لا يتسرّب رمزٌ خام إن أُنشِئت
    // بالخطأ من مسارٍ لاحق (test أُدخِلَ في prod عن غير قصد · حقن يدويّ).
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        '[emailer] DevConsoleEmailer refused to print in production — token would leak to stdout.',
      );
    }
    console.log(
      `\n${'='.repeat(60)}\n[emailer/dev-console] لا SMTP مُضبَط — طباعة بدلاً من الإرسال:\n  to: ${params.to}\n  subject: ${params.subject}\n  body:\n${params.body}\n${'='.repeat(60)}\n`,
    );
  }
}

class UnconfiguredProductionEmailer implements Emailer {
  async send(_params: { to: string; subject: string; body: string }): Promise<void> {
    // يجب ألا يُستدعى — config يفشل التشغيل. حماية إضافية لو أُفلت.
    throw new Error(
      'SMTP not configured in production — refusing to skip email delivery. Configure SMTP_* env vars.',
    );
  }
}

class SmtpEmailer implements Emailer {
  constructor(private cfg: Required<Pick<Config, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASS' | 'SMTP_FROM'>>) {}
  async send(_params: { to: string; subject: string; body: string }): Promise<void> {
    // TODO: تكامل nodemailer الحقيقي. حالياً stub حتى يُبنى بند إرسال البريد.
    console.log(
      `[emailer/smtp-stub] would send via ${this.cfg.SMTP_HOST}:${this.cfg.SMTP_PORT} from ${this.cfg.SMTP_FROM} — nodemailer integration pending`,
    );
  }
}

/**
 * 400 §٢ · حالة SMTP للإعلان مرّةً واحدة عند الإقلاع.
 *   • `smtp-configured` — SMTP كامل، الإرسال سيمرّ عبر nodemailer (حين يُبنى).
 *   • `dev-console`     — dev/test بلا SMTP، الرمز يُطبع في stdout للمطوّر.
 *   • `unconfigured-production` — إعداد ناقص في production (config يفشل قبلها،
 *     لكن نُعلن الحالة إن وصلنا بطريقةٍ ما).
 */
export type EmailerState = 'smtp-configured' | 'dev-console' | 'unconfigured-production';

export function describeEmailerState(config: Config): EmailerState {
  const smtpFull = Boolean(
    config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER && config.SMTP_PASS && config.SMTP_FROM,
  );
  if (smtpFull) return 'smtp-configured';
  if (config.NODE_ENV === 'production') return 'unconfigured-production';
  return 'dev-console';
}

let _emailer: Emailer | null = null;

export function getEmailer(config: Config): Emailer {
  if (_emailer) return _emailer;

  if (config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER && config.SMTP_PASS && config.SMTP_FROM) {
    _emailer = new SmtpEmailer({
      SMTP_HOST: config.SMTP_HOST,
      SMTP_PORT: config.SMTP_PORT,
      SMTP_USER: config.SMTP_USER,
      SMTP_PASS: config.SMTP_PASS,
      SMTP_FROM: config.SMTP_FROM,
    });
  } else if (config.NODE_ENV === 'production') {
    // لا يجب أن نصل هنا (config يفشل)، لكن حماية إضافية.
    _emailer = new UnconfiguredProductionEmailer();
  } else {
    _emailer = new DevConsoleEmailer();
  }
  return _emailer;
}
