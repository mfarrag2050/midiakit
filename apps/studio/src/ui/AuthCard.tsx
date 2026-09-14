'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useLocale } from '@pf-mediakit/i18n';
import { Alert, Button, Field, Input } from '@pf-mediakit/ui';
import { ApiError } from '@/src/api';

// AuthCard — بطاقة مصادقة عامة (login/signup/forgot/reset).
//
// **S5:** تتلقّى `onSubmit` من الصفحة المستضيفة. تدير حالة
// التحميل + عرض الأخطاء داخلياً. الصفحة تحدّد ماذا يحدث بعد
// النجاح (تحويل، رسالة، إلخ) عبر `successKey` أو throw في الـpromise.
//
// **قواعد:**
// - كل رسالة تعرض عبر `t(messageKey)` — لا نصّ ظاهر (L-22 + G-S5-3).
// - `ApiError` من طبقة الـclient تُترجم مباشرةً بمفتاحها.
// - أخطاء عامّة (network, unknown) تُعرض بمفتاح fallback.

export interface AuthField {
  readonly name: string;
  readonly labelKey: string;
  readonly type: 'text' | 'email' | 'password';
  readonly autoComplete?: string;
  readonly helpKey?: string;
  /** رمز أو true إن كان الحقل مطلوباً — يمنع submit إن كان فارغاً. */
  readonly required?: boolean;
  /** طول أدنى — للتحقّق قبل الشبكة. */
  readonly minLength?: number;
  /** يفعّل تحقّق شكل البريد قبل الشبكة. */
  readonly emailFormat?: boolean;
}

interface FooterLink {
  readonly key: string;
  readonly href: string;
}

interface Props {
  readonly titleKey: string;
  readonly subtitleKey: string;
  readonly submitKey: string;
  readonly linkKey?: string;
  readonly linkHref?: string;
  readonly fields: readonly AuthField[];
  readonly footerLinks?: readonly FooterLink[];
  /** Async handler — يرمي ApiError عند الفشل، يعود بنجاح للتحويل. */
  readonly onSubmit?: (values: Record<string, string>) => Promise<void>;
  /** إن كان الفلاق النجاحي رسالة (forgot/reset) لا تحويلاً. */
  readonly successKey?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clientValidate(
  fields: readonly AuthField[],
  values: Record<string, string>
): Record<string, string> {
  const errs: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.name] ?? '').trim();
    if (f.required && !v) {
      // مفاتيح مطابقة لأكواد mk-api الرسمية (بعد 410cc33).
      if (f.name === 'tenantName') errs[f.name] = 'errors.TENANT_NAME_EMPTY';
      else if (f.name === 'email') errs[f.name] = 'errors.EMAIL_INVALID';
      else errs[f.name] = 'errors.VALIDATION_FAILED';
      continue;
    }
    if (f.emailFormat && v && !EMAIL_RE.test(v)) {
      errs[f.name] = 'errors.EMAIL_INVALID';
      continue;
    }
    if (f.minLength && v.length > 0 && v.length < f.minLength) {
      errs[f.name] = 'errors.PASSWORD_TOO_WEAK';
      continue;
    }
  }
  return errs;
}

export function AuthCard({
  titleKey,
  subtitleKey,
  submitKey,
  linkKey,
  linkHref,
  fields,
  footerLinks,
  onSubmit,
  successKey,
}: Props): JSX.Element {
  const { t } = useLocale();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topErrorKey, setTopErrorKey] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handle(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setTopErrorKey(null);
    setShowSuccess(false);

    const clientErrs = clientValidate(fields, values);
    setErrors(clientErrs);
    if (Object.keys(clientErrs).length > 0) return;

    if (!onSubmit) return;
    setLoading(true);
    try {
      await onSubmit(values);
      if (successKey) setShowSuccess(true);
      // النجاح مع تحويل: الـpage يتكفّل، هذه الحالة لا تصل هنا.
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.field && fields.some((f) => f.name === err.field)) {
          setErrors({ ...clientErrs, [err.field]: err.messageKey });
        } else {
          setTopErrorKey(err.messageKey);
        }
      } else {
        setTopErrorKey('errors.NETWORK_ERROR');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-8 shadow-soft">
      <div className="mb-6 space-y-1 text-center">
        <div className="text-[10px] uppercase tracking-widest text-accent">
          {t('brand.name')}
        </div>
        <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
        <p className="text-sm text-fg-muted">{t(subtitleKey)}</p>
      </div>

      {topErrorKey && !showSuccess && (
        <div className="mb-4">
          <Alert kind="danger" titleKey={topErrorKey} />
        </div>
      )}

      {showSuccess && successKey && (
        <div className="mb-4">
          <Alert kind="success" titleKey={successKey} />
        </div>
      )}

      <form className="space-y-4" onSubmit={handle} noValidate>
        {fields.map((f) => {
          const errorKey = errors[f.name];
          return (
            <Field
              key={f.name}
              htmlFor={f.name}
              labelKey={f.labelKey}
              {...(errorKey ? { errorKey } : f.helpKey ? { helpKey: f.helpKey } : {})}
              {...(f.required ? { required: true } : {})}
            >
              <Input
                id={f.name}
                name={f.name}
                type={f.type}
                autoComplete={f.autoComplete ?? 'off'}
                value={values[f.name] ?? ''}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [f.name]: e.target.value }))
                }
                invalid={Boolean(errorKey)}
                disabled={loading}
                dir={
                  f.type === 'email' || f.type === 'password' ? 'ltr' : undefined
                }
              />
            </Field>
          );
        })}

        <Button type="submit" variant="primary" fullWidth loading={loading}>
          {t(submitKey)}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-xs text-fg-muted">
        {linkKey && linkHref && (
          <div>
            <Link href={linkHref} className="text-accent hover:underline">
              {t(linkKey)}
            </Link>
          </div>
        )}
        {footerLinks?.map((l) => (
          <div key={l.href}>
            <Link href={l.href} className="text-fg-muted hover:text-fg">
              {t(l.key)}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
