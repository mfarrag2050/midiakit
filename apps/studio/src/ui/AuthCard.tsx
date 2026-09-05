'use client';

import Link from 'next/link';
import { useLocale } from '@pf-mediakit/i18n';
import { Button, Field, Input } from '@pf-mediakit/ui';

// AuthCard — بطاقة مصادقة عامة (login/signup/forgot/reset).
// **عرض فقط** حتى S5 — لا تستدعي أيّ endpoint.

export interface AuthField {
  readonly name: string;
  readonly labelKey: string;
  readonly type: 'text' | 'email' | 'password';
  readonly autoComplete?: string;
  readonly helpKey?: string;
}

interface FooterLink {
  readonly key: string;
  readonly href: string;
}

interface Props {
  readonly titleKey: string;
  readonly subtitleKey: string;
  readonly submitKey: string;
  readonly linkKey: string;
  readonly linkHref: string;
  readonly fields: readonly AuthField[];
  readonly footerLinks?: readonly FooterLink[];
}

export function AuthCard({
  titleKey,
  subtitleKey,
  submitKey,
  linkKey,
  linkHref,
  fields,
  footerLinks,
}: Props): JSX.Element {
  const { t } = useLocale();
  return (
    <div className="rounded-lg border border-border bg-surface p-8 shadow-soft">
      <div className="mb-6 space-y-1 text-center">
        <div className="text-[10px] uppercase tracking-widest text-accent">
          {t('brand.name')}
        </div>
        <h1 className="text-xl font-semibold">{t(titleKey)}</h1>
        <p className="text-sm text-fg-muted">{t(subtitleKey)}</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          /* الربط في S5 */
        }}
      >
        {fields.map((f) => (
          <Field
            key={f.name}
            htmlFor={f.name}
            labelKey={f.labelKey}
            {...(f.helpKey ? { helpKey: f.helpKey } : {})}
          >
            <Input
              id={f.name}
              name={f.name}
              type={f.type}
              autoComplete={f.autoComplete ?? 'off'}
              dir={
                f.type === 'email' || f.type === 'password' ? 'ltr' : undefined
              }
            />
          </Field>
        ))}

        <Button type="submit" variant="primary" fullWidth>
          {t(submitKey)}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-center text-xs text-fg-muted">
        <div>
          <Link href={linkHref} className="text-accent hover:underline">
            {t(linkKey)}
          </Link>
        </div>
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
