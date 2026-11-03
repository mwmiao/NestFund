import Link from 'next/link';
import { AccountBadge } from '@/components/AccountBadge';
import { EmptyState } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { todayISO } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { accountName, categoryName } from '@/lib/labels';
import { isSpending, type Category, type Transaction } from '@/lib/types';

/** "Hoje", "Ontem", or "seg., 3 nov." (with the year only when it is not the current one). */
function dayLabel(date: string, locale: string, t: (k: string) => string) {
  const today = todayISO();
  const y = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  if (date === today) return t('common.today');
  if (date === y) return t('common.yesterday');
  const [yy, mm, dd] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: String(yy) === today.slice(0, 4) ? undefined : 'numeric',
  }).format(new Date(yy, mm - 1, dd));
}

export async function TransactionList({
  transactions,
  categories,
  locale,
  compact = false,
}: {
  transactions: Transaction[];
  categories: Category[];
  locale: string;
  compact?: boolean;
}) {
  const { t } = await getI18n();
  if (!transactions.length) return <EmptyState title={t('tx.emptyTitle')} hint={t('tx.emptyHint')} action={{ href: '/transactions/new', label: t('common.quickAdd') }} />;
  const catById = new Map(categories.map((c) => [c.id, c]));

  // Grouped by day, like a bank statement, with each day's spending total.
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx]);

  return (
    <div className="space-y-4">
      {[...groups.entries()].map(([date, list]) => {
        const daySpent = list.filter((x) => isSpending(x.type)).reduce((s, x) => s + x.amount, 0);
        return (
          <section key={date}>
            <div className="mb-1 flex items-center justify-between px-0.5 text-xs font-medium text-subtle">
              <h3 className="first-letter:uppercase">{dayLabel(date, locale, t)}</h3>
              {!compact && daySpent > 0 && <span className="tabular-nums">−{formatMoney(daySpent, locale)}</span>}
            </div>
            <ul className="divide-y divide-line/70">
              {list.map((tx) => {
                const cat = tx.categoryId != null ? catById.get(tx.categoryId) : undefined;
                const color = cat?.color ?? '#71717a';
                const income = tx.type === 'income';
                const transfer = tx.type === 'transfer';
                return (
                  <li key={tx.id}>
                    <Link href={`/transactions/${tx.id}`} className="-mx-2 flex items-center gap-3 rounded-control px-2 py-2.5 transition hover:bg-raised/60">
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                        style={{ background: `${color}1f`, color }}
                        aria-hidden
                      >
                        {transfer ? '⇄' : categoryName(cat, t).slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-sm font-medium">
                          <span className="truncate">{tx.description}</span>
                          {(tx.recurring || tx.parentId) && (
                            <span className="text-subtle" title={t('tx.recurring')} aria-label={t('tx.recurring')}>
                              ↻
                            </span>
                          )}
                          {tx.attachment && (
                            <span className="text-subtle" title={t('tx.attachment')} aria-label={t('tx.attachment')}>
                              📎
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-subtle">
                          <span className="truncate">
                            {transfer ? t('tx.types.transfer') : categoryName(cat, t)}
                            {tx.merchant ? ` · ${tx.merchant}` : ''}
                          </span>
                          <AccountBadge id={tx.account} label={accountName(tx.account, t)} size="xs" />
                          {tx.toAccount && (
                            <>
                              <span aria-hidden>→</span>
                              <AccountBadge id={tx.toAccount} label={accountName(tx.toAccount, t)} size="xs" />
                            </>
                          )}
                        </div>
                      </div>
                      <span className={`shrink-0 text-sm font-semibold tabular-nums ${income ? 'text-positive' : transfer ? 'text-subtle' : ''}`}>
                        {income ? '+' : transfer ? '' : '−'}
                        {formatMoney(tx.amount, locale)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
