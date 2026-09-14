import type { ReactNode } from 'react';
import { AppShell } from '@/src/ui/AppShell';

// تخطيط التطبيق المصادَق — يحتضن كل الشاشات بعد تسجيل الدخول.
// يعرض الشريط الجانبي والرأس بلغة/اتجاه المستخدم.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
