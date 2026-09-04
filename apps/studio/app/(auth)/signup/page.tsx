import { AuthCard } from '@/src/ui/AuthCard';

export default function SignupPage() {
  return (
    <AuthCard
      titleKey="auth.signup.title"
      subtitleKey="auth.signup.subtitle"
      submitKey="auth.signup.submit"
      linkKey="auth.signup.haveAccount"
      linkHref="/login"
      fields={[
        { name: 'tenantName', labelKey: 'auth.field.tenantName', type: 'text', autoComplete: 'organization' },
        { name: 'email', labelKey: 'auth.field.email', type: 'email', autoComplete: 'email' },
        { name: 'password', labelKey: 'auth.field.newPassword', type: 'password', autoComplete: 'new-password', helpKey: 'auth.hint.passwordMin' },
      ]}
    />
  );
}
