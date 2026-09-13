'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, LocaleSwitcher } from '@pf-mediakit/i18n';
import {
  clearSession,
  clearSessionInfo,
  getAccessToken,
  getSessionTenant,
  getSessionUser,
  type Tenant,
  type User,
} from '@/src/api';

// AppShell — التخطيط الكامل بعد تسجيل الدخول.
//
// **S7:** يقرأ tenant.name و user.email من الجلسة المخزَّنة.
// **240-PHONE-WIDTH:** على <md (شاشات < 768px)، الشريط الجانبي يصبح
// خزانة تُفتح بضغطة زرّ (hamburger) بدل احتلال 240px من 390px. على md
// وأكبر يبقى كما كان.

interface NavItem {
  readonly href: string;
  readonly labelKey: string;
  readonly icon: string;
}

const NAV: readonly NavItem[] = [
  { href: '/breaking', labelKey: 'nav.breaking', icon: '⚡' },
  { href: '/projects', labelKey: 'nav.projects', icon: '◫' },
  { href: '/brand-kits', labelKey: 'nav.brandKits', icon: '❋' },
  { href: '/templates', labelKey: 'nav.templates', icon: '▤' },
  { href: '/assets', labelKey: 'nav.assets', icon: '◈' },
  { href: '/renders', labelKey: 'nav.renders', icon: '↗' },
  { href: '/workflows', labelKey: 'nav.workflows', icon: '⇢' },
  { href: '/ai-settings', labelKey: 'nav.aiSettings', icon: '✱' },
  { href: '/billing', labelKey: 'nav.billing', icon: '⌂' },
  { href: '/design', labelKey: 'nav.design', icon: '⌘' },
];

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    setUser(getSessionUser());
    setTenant(getSessionTenant());
  }, [router]);

  // إغلاق الخزانة عند تغيير المسار (بعد اختيار عنصر).
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const displayTenantName = tenant?.name ?? t('nav.user.placeholder');
  const displayUserEmail = user?.email ?? t('nav.user.placeholder');

  const navList = (
    <ul className="space-y-0.5">
      {NAV.map((item) => {
        const active =
          pathname === item.href ||
          (pathname?.startsWith(item.href + '/') ?? false);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={
                'flex items-center gap-3 rounded px-3 py-2 text-sm transition ' +
                (active
                  ? 'bg-surface-2 text-fg'
                  : 'text-fg-muted hover:bg-surface-2 hover:text-fg')
              }
            >
              <span aria-hidden className="w-4 text-center text-fg-subtle">
                {item.icon}
              </span>
              <span>{t(item.labelKey)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="grid min-h-screen md:grid-cols-[240px_1fr]">
      {/* Sidebar — يظهر دائماً على md+، ويصبح خزانة على <md */}
      <aside className="hidden border-e border-border bg-surface md:block">
        <div className="border-b border-border px-5 py-5">
          <div className="text-xs uppercase tracking-widest text-fg-subtle">
            {t('brand.tagline')}
          </div>
          <div className="mt-1 font-latin text-lg font-semibold tracking-tight">
            {t('brand.name')}
          </div>
        </div>
        <nav className="p-3">{navList}</nav>
      </aside>

      {/* Mobile drawer — يفتح على <md فقط */}
      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t('nav.mobile.closeMenu')}
            className="absolute inset-0 bg-black/60"
            onClick={() => setNavOpen(false)}
          />
          <aside className="absolute inset-y-0 end-0 w-64 overflow-y-auto border-s border-border bg-surface shadow-xl">
            <div className="border-b border-border px-5 py-5">
              <div className="text-xs uppercase tracking-widest text-fg-subtle">
                {t('brand.tagline')}
              </div>
              <div className="mt-1 font-latin text-lg font-semibold tracking-tight">
                {t('brand.name')}
              </div>
            </div>
            <nav className="p-3">{navList}</nav>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* Hamburger — على <md فقط */}
            <button
              type="button"
              aria-label={t('nav.mobile.openMenu')}
              aria-expanded={navOpen}
              className="rounded p-2 text-fg-muted hover:bg-surface-2 md:hidden"
              onClick={() => setNavOpen(true)}
            >
              <span aria-hidden className="text-lg leading-none">☰</span>
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-fg">
                {displayTenantName}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-fg-subtle">
                {t('nav.workspace')}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-fg-muted md:gap-4">
            <div className="hidden sm:block"><LocaleSwitcher /></div>
            <span aria-hidden className="hidden md:inline">·</span>
            <span dir="ltr" className="hidden max-w-[180px] truncate md:inline">
              {displayUserEmail}
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  const { auth } = await import('@/src/api');
                  await auth.logout();
                } catch {
                  /* حتى لو فشل الخادم، امسح المحلي */
                } finally {
                  clearSession();
                  clearSessionInfo();
                  router.replace('/login');
                }
              }}
              className="rounded px-2 py-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              {t('nav.user.signOut')}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
