import type { ReactNode } from 'react';
import { AuthShell } from '@/src/ui/AuthShell';

// تخطيط شاشات المصادقة — بلا شريط جانبي، عمود مركزي هادئ.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
