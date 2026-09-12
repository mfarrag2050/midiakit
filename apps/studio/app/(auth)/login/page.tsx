'use client';

import { useRouter } from 'next/navigation';
import { AuthCard } from '@/src/ui/AuthCard';
import { auth, setSessionInfo } from '@/src/api';

// شاشة تسجيل الدخول — S5 على mocks حتى A6-A8. تنتقل إلى الحقيقي
// حين يُزال `NEXT_PUBLIC_API_MOCK=true` من البيئة.
export default function LoginPage() {
  const router = useRouter();
  return (
    <AuthCard
      titleKey="auth.login.title"
      subtitleKey="auth.login.subtitle"
      submitKey="auth.login.submit"
      linkKey="auth.login.needAccount"
      linkHref="/signup"
      fields={[
        {
          name: 'email',
          labelKey: 'auth.field.email',
          type: 'email',
          autoComplete: 'email',
          required: true,
          emailFormat: true,
          placeholderKey: 'auth.field.emailPlaceholder',
        },
        {
          name: 'password',
          labelKey: 'auth.field.password',
          type: 'password',
          autoComplete: 'current-password',
          required: true,
          placeholderKey: 'auth.field.passwordPlaceholder',
        },
      ]}
      footerLinks={[{ key: 'auth.login.forgot', href: '/forgot-password' }]}
      onSubmit={async (values) => {
        const res = await auth.login({
          email: values.email ?? '',
          password: values.password ?? '',
        });
        setSessionInfo(res.user, res.tenant);
        router.push('/projects');
        // نُبقي حالة التحميل في `AuthCard` حتى الانتقال بدل الوميض بين
        // «متوقّف» وdashboard — بلا هذا يعود الزرّ إلى شكله الافتراضيّ
        // ثوانيَ قبل الانتقال (مشية 190 §٥). ينتهي عند unmount.
        await new Promise<void>(() => {});
      }}
    />
  );
}
