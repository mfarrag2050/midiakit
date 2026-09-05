import type { ReactNode } from 'react';

// Badge — علامة صغيرة (حالة، عدّاد، تصنيف).
type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-fg-muted border-border',
  accent: 'bg-accent/15 text-accent border-accent/30',
  success: 'bg-success/15 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/40',
  danger: 'bg-danger/15 text-danger border-danger/40',
};

export function Badge({
  tone = 'neutral',
  children,
}: {
  readonly tone?: Tone;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <span
      className={
        'inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-medium ' +
        TONES[tone]
      }
    >
      {children}
    </span>
  );
}
