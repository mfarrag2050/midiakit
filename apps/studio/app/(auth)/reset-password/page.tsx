'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthCard } from '@/src/ui/AuthCard';
import { auth } from '@/src/api';

// reset-password — الرابط المُرسَل بالبريد يحمل `?token=…` يقرأه Next
// من searchParams. نجاح 204 يعيد إلى /login.
function ResetPasswordPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get('token') ?? '';
  return (
    <AuthCard
      titleKey="auth.reset.title"
      subtitleKey="auth.reset.subtitle"
      submitKey="auth.reset.submit"
      linkKey="auth.reset.backToLogin"
      linkHref="/login"
      fields={[
        {
          name: 'newPassword',
          labelKey: 'auth.field.newPassword',
          type: 'password',
          autoComplete: 'new-password',
          helpKey: 'auth.hint.passwordMin',
          required: true,
          minLength: 12,
        },
      ]}
      onSubmit={async (values) => {
        await auth.resetPassword({
          token,
          newPassword: values.newPassword ?? '',
        });
        router.push('/login');
      }}
    />
  );
}

export default function ResetPasswordPage() {
  // ٤٣٣ · لفٌّ في Suspense — `useSearchParams` يستوجبُ حدَّ تعليقٍ في
  // Next 14 (missing-suspense-with-csr-bailout). لفٌّ لا إعادةُ كتابة.
  return (
    <Suspense fallback={<div aria-hidden="true" />}>
      <ResetPasswordPageInner />
    </Suspense>
  );
}
