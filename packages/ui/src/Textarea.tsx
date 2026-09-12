'use client';

import type { TextareaHTMLAttributes } from 'react';
import { forwardRef } from 'react';

interface Props
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  readonly invalid?: boolean;
  readonly className?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { invalid = false, className = '', rows = 4, ...rest },
  ref
) {
  const border = invalid ? 'border-danger' : 'border-border focus:border-accent';
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={
        'w-full rounded border bg-surface-2 px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-subtle disabled:opacity-50 ' +
        border +
        (className ? ' ' + className : '')
      }
      {...rest}
    />
  );
});
