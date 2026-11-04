'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';
import { Icon } from './Icon';

const BELL = 'M6 9a6 6 0 1112 0c0 5 2 6.5 2 6.5H4S6 14 6 9zm4 9.5a2 2 0 004 0';

/** Bell with the number of open in-app notices. Re-checks after every navigation, so it stays current without a page reload. */
export function NotificationBell({ className = 'btn-ghost !p-2' }: { className?: string }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch('/api/notifications', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => alive && setCount(d?.count ?? 0))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [pathname]);
  const label = count > 0 ? `${t('notifications.title')} (${count})` : t('notifications.title');
  return (
    <Link href="/notifications" className={`relative ${className}`} title={label} aria-label={label}>
      <Icon d={BELL} className="h-[18px] w-[18px]" />
      {count > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-none text-white">{count > 9 ? '9+' : count}</span>
      )}
    </Link>
  );
}
