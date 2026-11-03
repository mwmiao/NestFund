'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NAV_ICONS } from './nav';
import { ThemeToggle } from './ThemeToggle';

/** Slim top bar for mobile/tablet; desktop uses the sidebar. */
export function Header({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur lg:hidden">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          NestFund
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle theme={theme} />
          <Link href="/settings" className="btn-ghost !p-2" title={t('nav.settings')} aria-label={t('nav.settings')}>
            <Icon d={NAV_ICONS.settings} className="h-[18px] w-[18px]" />
          </Link>
        </div>
      </div>
    </header>
  );
}
