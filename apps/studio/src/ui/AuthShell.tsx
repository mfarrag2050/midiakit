import type { ReactNode } from 'react';

// AuthShell — عمود مركزي هادئ لشاشات المصادقة.
export function AuthShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
