import Link from 'next/link';
import { addMonths, currentMonth, monthLabel } from '@/lib/dates';

/** Server-rendered prev/next month navigation using the `m` query param. */
export function MonthPicker({ month, basePath, locale, labels }: { month: string; basePath: string; locale: string; labels: { prev: string; next: string; today: string } }) {
  const link = (m: string) => `${basePath}?m=${m}`;
  const isCurrent = month === currentMonth();
  return (
    <div className="flex items-center gap-1">
      <Link href={link(addMonths(month, -1))} className="btn-secondary !px-2.5" aria-label={labels.prev}>
        ‹
      </Link>
      <span className="min-w-[9.5rem] text-center text-sm font-medium">{monthLabel(month, locale)}</span>
      <Link href={link(addMonths(month, 1))} className="btn-secondary !px-2.5" aria-label={labels.next}>
        ›
      </Link>
      {!isCurrent && (
        <Link href={link(currentMonth())} className="btn-ghost text-xs">
          {labels.today}
        </Link>
      )}
    </div>
  );
}
