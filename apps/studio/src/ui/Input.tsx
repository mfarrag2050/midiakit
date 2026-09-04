'use client';

import type { InputHTMLAttributes } from 'react';
import { forwardRef } from 'react';

// Input عام. يحمل حالة `invalid` بصرياً (يرافق `Field.error`).
// **قاعدة RTL:** الإدخال لا يحمل dir بذاته — الأنواع الحساسة للاتجاه
// (email, url, tel، بعض passwords) يمرّرها الاستدعاء عبر `dir="ltr"`.

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  readonly invalid?: boolean;
  readonly className?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { invalid = false, className = '', ...rest },
  ref
) {
  const border = invalid ? 'border-danger' : 'border-border focus:border-accent';
  return (
    <input
      ref={ref}
      className={
        'h-10 w-full rounded border bg-surface-2 px-3 text-sm text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50 ' +
        border +
        (className ? ' ' + className : '')
      }
      {...rest}
    />
  );
});
