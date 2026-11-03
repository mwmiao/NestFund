'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/client';
import { NAV_ITEMS, isActive } from './nav';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeToggle } from './ThemeToggle';

export function Header({ theme }: { theme: 'dark' | 'light' }) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          <span>NestFund</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-2.5 py-1.5 text-sm transition ${
                isActive(pathname, item.href)
                  ? 'bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-white'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle theme={theme} />
        </div>
      </div>
    </header>
  );
}
