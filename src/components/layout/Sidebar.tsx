'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NAV_ICONS, PRIMARY_NAV, SECONDARY_NAV, isActive, type NavItem } from './nav';
import { ThemeToggle } from './ThemeToggle';

/** Desktop navigation (lg and up). */
export function Sidebar({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useI18n();
  const pathname = usePathname();

  const link = (item: NavItem) => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-3 rounded-control px-3 py-2 text-sm transition ${
          active ? 'bg-raised font-medium text-ink' : 'text-subtle hover:bg-raised/60 hover:text-ink'
        }`}
      >
        <Icon d={item.icon} className={`h-[18px] w-[18px] ${active ? 'text-brand-500' : ''}`} />
        {t(item.key)}
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface/60 px-3 py-5 backdrop-blur lg:flex">
      <Link href="/" className="mb-6 flex items-center gap-2.5 px-3 text-[15px] font-semibold">
        <img src="/icon.svg" alt="" className="h-7 w-7" />
        NestFund
      </Link>
      <Link href="/transactions/new" className="btn-primary mb-5 w-full">
        <Icon d={NAV_ICONS.plus} className="h-4 w-4" />
        {t('common.quickAdd')}
      </Link>
      <nav aria-label="Main" className="space-y-0.5">
        {PRIMARY_NAV.map(link)}
      </nav>
      <div className="eyebrow mb-1 mt-6 px-3">{t('nav.tools')}</div>
      <nav aria-label="Tools" className="space-y-0.5">
        {SECONDARY_NAV.map(link)}
      </nav>
      <div className="mt-auto flex items-center justify-between gap-2 px-1 pt-4">
        <LanguageSwitcher />
        <ThemeToggle theme={theme} />
      </div>
    </aside>
  );
}
