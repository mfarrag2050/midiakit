'use client';

import { useRouter } from 'next/navigation';
import { AuthCard } from '@/src/ui/AuthCard';
import { auth, setSessionInfo } from '@/src/api';

export default function SignupPage() {
  const router = useRouter();
  return (
    <AuthCard
      titleKey="auth.signup.title"
      subtitleKey="auth.signup.subtitle"
      submitKey="auth.signup.submit"
      linkKey="auth.signup.haveAccount"
      linkHref="/login"
      fields={[
        {
          name: 'tenantName',
          labelKey: 'auth.field.tenantName',
          type: 'text',
          autoComplete: 'organization',
          required: true,
        },
        {
          name: 'email',
          labelKey: 'auth.field.email',
          type: 'email',
          autoComplete: 'email',
          required: true,
          emailFormat: true,
        },
        {
          name: 'password',
          labelKey: 'auth.field.newPassword',
          type: 'password',
          autoComplete: 'new-password',
          helpKey: 'auth.hint.passwordMin',
          required: true,
          minLength: 12,
        },
      ]}
      onSubmit={async (values) => {
        const res = await auth.signup({
          tenantName: values.tenantName ?? '',
          email: values.email ?? '',
          password: values.password ?? '',
        });
        // signup يعيد user (role='owner') + tenant + session تلقائياً.
        // ملاحظة: SignupResponse.user يحمل {id,email,role} فقط — نصنع
        // شكل User الكامل (بلا createdAt، سيُحدَّث من /v1/users لاحقاً).
        setSessionInfo(
          { ...res.user, createdAt: new Date().toISOString() },
          res.tenant
        );
        router.push('/projects');
      }}
    />
  );
}
