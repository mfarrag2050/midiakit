'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale } from '@/src/i18n/LocaleProvider';

// AppShell — التخطيط الكامل بعد تسجيل الدخول: شريط جانبي + رأس + مضمون.
// المكوّنات الذرّية (Button, Field…) تُبنى في S2. هنا التخطيط فقط.

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
];

export function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const { t } = useLocale();
  const pathname = usePathname();

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-e border-border bg-surface">
        <div className="border-b border-border px-5 py-5">
          <div className="text-xs uppercase tracking-widest text-fg-subtle">
            {t('brand.tagline')}
          </div>
          <div className="mt-1 font-latin text-lg font-semibold tracking-tight">
            Media Kit
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
                    <span
                      aria-hidden
                      className="w-4 text-center text-fg-subtle"
                    >
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
          <div className="text-sm text-fg-muted">{t('nav.workspace')}</div>
          <div className="flex items-center gap-4 text-xs text-fg-muted">
            {/* LocaleSwitcher يُضاف في S3 */}
            <span aria-hidden>·</span>
            <span>{t('nav.user.placeholder')}</span>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
