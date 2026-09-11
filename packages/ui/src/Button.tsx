'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

// Button — رتب: primary (ذهبي)، secondary (سطح)، ghost (شفاف)، danger.
// أحجام: sm | md.
// حالات: عادي، loading (يعطّل + سبينر)، disabled.
//
// **قاعدة RTL:** لا "left/right" — نستعمل "start/end" فقط عبر
// Tailwind logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`). المكوّن
// يبدو صحيحاً في dir=rtl وdir=ltr بلا فروع شرطية.

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: Variant;
  readonly size?: Size;
  readonly loading?: boolean;
  readonly leadingIcon?: ReactNode;
  readonly trailingIcon?: ReactNode;
  readonly fullWidth?: boolean;
  readonly className?: string;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-accent-fg hover:brightness-110 disabled:opacity-50',
  secondary:
    'bg-surface-2 text-fg border border-border hover:bg-surface hover:border-fg-subtle disabled:opacity-50',
  ghost:
    'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40',
  danger:
    'bg-danger text-white hover:brightness-110 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 text-xs px-3 rounded',
  md: 'h-10 text-sm px-4 rounded',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: Props): JSX.Element {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type}
      disabled={isDisabled}
      className={
        'inline-flex items-center justify-center gap-2 font-medium transition ' +
        SIZES[size] +
        ' ' +
        VARIANTS[variant] +
        (fullWidth ? ' w-full' : '') +
        (isDisabled ? ' cursor-not-allowed' : ' cursor-pointer') +
        (className ? ' ' + className : '')
      }
      {...rest}
    >
      {loading && (
        <span
          className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden
        />
      )}
      {!loading && leadingIcon}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}
