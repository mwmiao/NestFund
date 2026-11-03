'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';
import { NAV_ITEMS, isActive } from './nav';

const PRIMARY = ['/', '/transactions', '/budget', '/goals'];
const PLUS = 'M12 5v14M5 12h14';
const MORE = 'M5 12h.01M12 12h.01M19 12h.01';

/** Mobile navigation with a central quick-add button for logging purchases fast. */
export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const primary = NAV_ITEMS.filter((i) => PRIMARY.includes(i.href));
  const secondary = NAV_ITEMS.filter((i) => !PRIMARY.includes(i.href));

  const item = (i: (typeof NAV_ITEMS)[number]) => (
    <Link
      key={i.href}
      href={i.href}
      onClick={() => setOpen(false)}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${
        isActive(pathname, i.href) ? 'text-brand-500' : 'text-zinc-500 dark:text-zinc-400'
      }`}
    >
      <Icon d={i.icon} />
      {t(i.key)}
    </Link>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-x-3 bottom-20 z-40 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 md:hidden">
          {secondary.map((i) => (
            <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
              <Icon d={i.icon} /> {t(i.key)}
            </Link>
          ))}
          <Link href="/transactions/categories" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <Icon d="M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v4H4zM14 16h6v4h-6z" /> {t('nav.categories')}
          </Link>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
        <div className="flex items-stretch">
          {primary.slice(0, 2).map(item)}
          <Link
            href="/transactions/new"
            onClick={() => setOpen(false)}
            aria-label={t('common.quickAdd')}
            className="mx-2 -mt-5 flex h-14 w-14 shrink-0 items-center justify-center self-start rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30"
          >
            <Icon d={PLUS} className="h-7 w-7" />
          </Link>
          {primary.slice(2).map(item)}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${open ? 'text-brand-500' : 'text-zinc-500 dark:text-zinc-400'}`}
          >
            <Icon d={MORE} />
            {t('nav.more')}
          </button>
        </div>
      </nav>
    </>
  );
}
