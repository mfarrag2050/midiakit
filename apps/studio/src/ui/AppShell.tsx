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
// **S7 (بعد S6-FIX):** يقرأ tenant.name و user.email من الجلسة المخزَّنة
// (localStorage بعد login/signup). login response صار يحمل
// `tenant.{id,name,plan}` كاملاً بعد `410cc33` — الاستدعاء الإضافي
// `GET /v1/tenant` عند mount **حُذف** (كان يعوّض عن نقص كان
// مؤقّتاً في الاستجابة الأصلية).
// **الحماية:** بلا access token = تحويل إلى `/login` مباشرةً.

interface NavItem {
  readonly href: string;
  readonly labelKey: string;
  readonly icon: string;
}

const NAV: readonly NavItem[] = [
  { href: '/projects', labelKey: 'nav.projects', icon: '◫' },
  { href: '/brand-kits', labelKey: 'nav.brandKits', icon: '❋' },
  { href: '/templates', labelKey: 'nav.templates', icon: '▤' },
  { href: '/assets', labelKey: 'nav.assets', icon: '◈' },
  { href: '/renders', labelKey: 'nav.renders', icon: '↗' },
  { href: '/design', labelKey: 'nav.design', icon: '⌘' },
];

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  useEffect(() => {
    // بلا access token = بلا جلسة، حوّل إلى login.
    if (!getAccessToken()) {
      router.replace('/login');
      return;
    }
    // اقرأ ما هو مخزَّن من login/signup — يحوي name + plan منذ 410cc33.
    setUser(getSessionUser());
    setTenant(getSessionTenant());
  }, [router]);

  const displayTenantName = tenant?.name ?? t('nav.user.placeholder');
  const displayUserEmail = user?.email ?? t('nav.user.placeholder');

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-e border-border bg-surface">
        <div className="border-b border-border px-5 py-5">
          <div className="text-xs uppercase tracking-widest text-fg-subtle">
            {t('brand.tagline')}
          </div>
          <div className="mt-1 font-latin text-lg font-semibold tracking-tight">
            {t('brand.name')}
          </div>
        </div>
        <nav className="p-3">
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
        </nav>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-fg">
              {displayTenantName}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-fg-subtle">
              {t('nav.workspace')}
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-fg-muted">
            <LocaleSwitcher />
            <span aria-hidden>·</span>
            <span dir="ltr" className="truncate max-w-[180px]">
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
              className="text-fg-muted hover:text-fg"
            >
              {t('nav.user.signOut')}
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
