'use client';

import Link from 'next/link';
import { LanguageSwitcher } from './LanguageSwitcher';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';

/** Slim top bar for mobile/tablet; desktop uses the sidebar. */
export function Header({ theme }: { theme: 'dark' | 'light' }) {
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
        </div>
      </div>
    </header>
  );
}
