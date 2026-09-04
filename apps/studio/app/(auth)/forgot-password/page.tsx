import { AuthCard } from '@/src/ui/AuthCard';

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      titleKey="auth.forgot.title"
      subtitleKey="auth.forgot.subtitle"
      submitKey="auth.forgot.submit"
      linkKey="auth.forgot.backToLogin"
      linkHref="/login"
      fields={[
        { name: 'email', labelKey: 'auth.field.email', type: 'email', autoComplete: 'email' },
      ]}
    />
  );
}
