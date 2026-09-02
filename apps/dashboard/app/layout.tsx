import type { Metadata } from 'next';
import './globals.css';
import { LocaleProvider } from '@/src/i18n/LocaleProvider';
import { LocaleSwitcher } from '@/src/i18n/LocaleSwitcher';
import { AppHeader } from '@/src/ui/AppHeader';

export const metadata: Metadata = {
  title: 'Media Kit — Dashboards',
  description: 'رؤية الطوابير والحمل — لعملاء pf-mediakit',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // dir/lang يُضبطان من LocaleProvider بعد mount — نبدأ بـrtl (الافتراضي).
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-screen antialiased">
        <LocaleProvider>
          <div className="mx-auto max-w-6xl px-4 py-6">
            <AppHeader>
              <LocaleSwitcher />
            </AppHeader>
            {children}
          </div>
        </LocaleProvider>
      </body>
    </html>
  );
}
