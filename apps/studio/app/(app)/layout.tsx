import type { ReactNode } from 'react';
import { AppShell } from '@/src/ui/AppShell';
import { AuthExpiredBanner } from '@/src/ui/AuthExpiredBanner';

// تخطيط التطبيق المصادَق — يحتضن كل الشاشات بعد تسجيل الدخول.
// يعرض الشريط الجانبي والرأس بلغة/اتجاه المستخدم.
// **330:** `AuthExpiredBanner` overlay عالميّ يظهر حين client.ts يكتشف
// تحويلة CF Access (302 opaqueredirect على /v1/*). لا نُخفيه إلّا بضغطة
// «إعادة التحميل» — كلّ رسالة خطأ لها فعل تالٍ.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <AuthExpiredBanner />
    </>
  );
}
