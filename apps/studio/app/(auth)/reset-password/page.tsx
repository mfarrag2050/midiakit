import { AuthCard } from '@/src/ui/AuthCard';

export default function ResetPasswordPage() {
  return (
    <AuthCard
      titleKey="auth.reset.title"
      subtitleKey="auth.reset.subtitle"
      submitKey="auth.reset.submit"
      linkKey="auth.reset.backToLogin"
      linkHref="/login"
      fields={[
        { name: 'newPassword', labelKey: 'auth.field.newPassword', type: 'password', autoComplete: 'new-password', helpKey: 'auth.hint.passwordMin' },
      ]}
    />
  );
}
