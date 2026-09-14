import type { ReactNode } from 'react';
import { LocaleSwitcher } from '@pf-mediakit/i18n';

// AuthShell — عمود مركزي هادئ لشاشات المصادقة، مع مبدّل لغة يتيح
// اختيار اللغة قبل الحساب.
export function AuthShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <div className="flex justify-end px-6 py-4">
        <LocaleSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
