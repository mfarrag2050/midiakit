import { AuthCard } from '@/src/ui/AuthCard';

// شاشة تسجيل الدخول — البنية والحقول جاهزة، الربط بـ`/v1/auth/login`
// يتم في S5 بعد اكتمال A6 (endpoints مصادقة في mk-api).
export default function LoginPage() {
  return (
    <AuthCard
      titleKey="auth.login.title"
      subtitleKey="auth.login.subtitle"
      submitKey="auth.login.submit"
      linkKey="auth.login.needAccount"
      linkHref="/signup"
      fields={[
        { name: 'email', labelKey: 'auth.field.email', type: 'email', autoComplete: 'email' },
        { name: 'password', labelKey: 'auth.field.password', type: 'password', autoComplete: 'current-password' },
      ]}
      footerLinks={[
        { key: 'auth.login.forgot', href: '/forgot-password' },
      ]}
    />
  );
}
