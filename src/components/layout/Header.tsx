'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MORE_EVENT } from './BottomNav';
import { NotificationBell } from './NotificationBell';
import { NAV_ICONS } from './nav';
import { ThemeToggle } from './ThemeToggle';

/** Slim top bar for mobile/tablet; desktop uses the sidebar. */
export function Header({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur lg:hidden">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-semibold">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          NestFund
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeToggle theme={theme} />
          <NotificationBell />
          <button type="button" className="btn-ghost !p-2" title={t('nav.more')} aria-label={t('nav.more')} onClick={() => window.dispatchEvent(new Event(MORE_EVENT))}>
            <Icon d={NAV_ICONS.more} className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
