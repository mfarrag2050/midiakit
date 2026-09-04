'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useLocale } from '@/src/i18n/LocaleProvider';
import { Button } from './Button';

// Dialog قائم على `<dialog>` — يدير focus + backdrop + Escape بلا JS يدوي.
// **قاعدة RTL:** الحوار عمودي وسط الشاشة — لا تنسيق أفقي حسّاس للاتجاه.

interface Props {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly titleKey: string;
  readonly bodyKey?: string;
  readonly confirmKey?: string;
  readonly cancelKey?: string;
  readonly variant?: 'default' | 'danger';
  readonly onConfirm?: () => void;
  readonly children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  titleKey,
  bodyKey,
  confirmKey,
  cancelKey = 'actions.cancel',
  variant = 'default',
  onConfirm,
  children,
}: Props): JSX.Element | null {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  // إغلاق عند النقر خارج المحتوى (الـbackdrop) — <dialog> ينشر النقر على نفسه.
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>): void => {
    if (e.target === ref.current) onClose();
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={handleClick}
      className="rounded-lg border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-black/60"
    >
      <div className="w-[min(92vw,32rem)] p-6">
        <h2 className="text-base font-semibold">{t(titleKey)}</h2>
        {bodyKey && (
          <p className="mt-2 text-sm text-fg-muted">{t(bodyKey)}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t(cancelKey)}
          </Button>
          {confirmKey && onConfirm && (
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              size="sm"
              onClick={onConfirm}
            >
              {t(confirmKey)}
            </Button>
          )}
        </div>
      </div>
    </dialog>
  );
}
