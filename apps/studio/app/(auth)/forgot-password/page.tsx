'use client';

import { AuthCard } from '@/src/ui/AuthCard';
import { auth } from '@/src/api';

// forgot-password — الخادم يعيد 204 دائماً كي لا يكشف وجود البريد.
// لا تحويل — نُظهر رسالة نجاح ثابتة عبر `successKey`.
export default function ForgotPasswordPage() {
  return (
    <AuthCard
      titleKey="auth.forgot.title"
      subtitleKey="auth.forgot.subtitle"
      submitKey="auth.forgot.submit"
      linkKey="auth.forgot.backToLogin"
      linkHref="/login"
      fields={[
        {
          name: 'email',
          labelKey: 'auth.field.email',
          type: 'email',
          autoComplete: 'email',
          required: true,
          emailFormat: true,
        },
      ]}
      successKey="auth.forgot.sent"
      onSubmit={async (values) => {
        await auth.forgotPassword(values.email ?? '');
      }}
    />
  );
}
