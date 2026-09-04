'use client';

import type { ReactNode } from 'react';
import { useLocale } from '@/src/i18n/LocaleProvider';

// Alert — تنبيهات مضمنة (inline) بأربعة أنماط. لا animate — نُظهرها
// حين تصل معلومة، ولا نجذب الانتباه لفترة طويلة.

type Kind = 'info' | 'success' | 'warning' | 'danger';

const STYLES: Record<Kind, { bar: string; text: string; icon: string }> = {
  info: { bar: 'bg-fg-subtle', text: 'text-fg', icon: 'ℹ' },
  success: { bar: 'bg-success', text: 'text-fg', icon: '✓' },
  warning: { bar: 'bg-warning', text: 'text-fg', icon: '⚠' },
  danger: { bar: 'bg-danger', text: 'text-fg', icon: '✕' },
};

interface Props {
  readonly kind?: Kind;
  readonly titleKey?: string;
  readonly bodyKey?: string;
  readonly children?: ReactNode;
}

export function Alert({
  kind = 'info',
  titleKey,
  bodyKey,
  children,
}: Props): JSX.Element {
  const { t } = useLocale();
  const s = STYLES[kind];
  return (
    <div
      role="status"
      className="flex items-start gap-3 overflow-hidden rounded border border-border bg-surface"
    >
      <span aria-hidden className={'w-1 self-stretch ' + s.bar} />
      <div className="flex-1 py-3 pe-4 text-sm">
        {titleKey && (
          <div className={'font-medium ' + s.text}>
            <span className="me-2" aria-hidden>
              {s.icon}
            </span>
            {t(titleKey)}
          </div>
        )}
        {bodyKey && (
          <p className={'mt-1 text-xs text-fg-muted'}>{t(bodyKey)}</p>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}
