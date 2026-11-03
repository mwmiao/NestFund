'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';
import { MOBILE_MORE, MOBILE_TABS, NAV_ICONS, isActive, type NavItem } from './nav';

/** Mobile/tablet navigation (below lg): 3 tabs, a central add button and a "More" sheet. */
export function BottomNav() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const moreActive = MOBILE_MORE.some((i) => isActive(pathname, i.href));

  const tab = (i: NavItem) => {
    const active = isActive(pathname, i.href);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? 'page' : undefined}
        className={`flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 text-[11px] font-medium ${active ? 'text-brand-500' : 'text-subtle'}`}
      >
        <Icon d={i.icon} className="h-[22px] w-[22px]" />
        {t(i.key)}
      </Link>
    );
  };

  return (
    <>
      {open && (
        <>
          <button type="button" aria-label={t('common.close')} className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 rounded-card border border-line bg-surface p-2 shadow-pop lg:hidden" role="menu">
            <div className="grid grid-cols-3 gap-1">
              {MOBILE_MORE.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  role="menuitem"
                  className={`flex flex-col items-center gap-1.5 rounded-control px-2 py-3 text-center text-xs font-medium transition hover:bg-raised ${
                    isActive(pathname, i.href) ? 'bg-raised text-ink' : 'text-subtle'
                  }`}
                >
                  <Icon d={i.icon} className="h-[22px] w-[22px]" />
                  {t(i.key)}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-xl items-end">
          {tab(MOBILE_TABS[0])}
          {tab(MOBILE_TABS[1])}
          <div className="flex flex-1 justify-center">
            <Link
              href="/transactions/new"
              aria-label={t('common.quickAdd')}
              className="-mt-6 mb-1.5 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-white shadow-pop ring-4 ring-canvas transition active:scale-95"
            >
              <Icon d={NAV_ICONS.plus} className="h-7 w-7" />
            </Link>
          </div>
          {tab(MOBILE_TABS[2])}
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 text-[11px] font-medium ${open || moreActive ? 'text-brand-500' : 'text-subtle'}`}
          >
            <Icon d={NAV_ICONS.more} className="h-[22px] w-[22px]" />
            {t('nav.more')}
          </button>
        </div>
      </nav>
    </>
  );
}
