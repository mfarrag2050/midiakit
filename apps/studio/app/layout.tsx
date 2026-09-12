import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { LocaleProvider } from '@pf-mediakit/i18n';

export const metadata: Metadata = {
  title: 'Media Kit — Studio',
  description: 'محرّر Media Kit — محرّك الطباعة العربية للوكالات.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  // dir/lang يُضبطان من LocaleProvider بعد mount — نبدأ بـrtl (الافتراضي
  // العربي). المتصفّح لن يرمش لأن الطبقة تعيد نفس القيمة إن لم يتغيّر شيء.
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen font-sans antialiased">
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
