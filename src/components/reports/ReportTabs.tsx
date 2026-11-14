import Link from 'next/link';
import type { TFunction } from '@/i18n/config';

const TABS = [
  { id: 'month', href: '/reports', key: 'reports.view.month' },
  { id: 'time', href: '/reports/over-time', key: 'reports.view.time' },
] as const;

/** Switch between the per-period report and the over-time view. */
export function ReportTabs({ active, t }: { active: (typeof TABS)[number]['id']; t: TFunction }) {
  return (
    <nav className="mb-4 inline-flex gap-1 rounded-control bg-raised p-1" aria-label={t('reports.title')}>
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? 'page' : undefined}
          className={`min-h-10 rounded-[0.6rem] px-4 py-2 text-sm font-medium transition ${active === tab.id ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink'}`}
        >
          {t(tab.key)}
        </Link>
      ))}
    </nav>
  );
}
