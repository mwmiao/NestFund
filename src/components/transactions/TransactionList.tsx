import Link from 'next/link';
import { Dot, EmptyState } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { AccountBadge } from '@/components/AccountBadge';
import { accountName, categoryName } from '@/lib/labels';
import type { Category, Transaction } from '@/lib/types';

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

  // Group by date so the list reads like a bank statement.
  const groups = new Map<string, Transaction[]>();
  for (const tx of transactions) groups.set(tx.date, [...(groups.get(tx.date) ?? []), tx]);

  return (
    <div className="space-y-3">
      {[...groups.entries()].map(([date, list]) => (
        <div key={date}>
          {!compact && <div className="muted mb-1 text-xs font-medium">{formatDate(date)}</div>}
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {list.map((tx) => {
              const cat = tx.categoryId != null ? catById.get(tx.categoryId) : undefined;
              const income = tx.type === 'income';
              const transfer = tx.type === 'transfer';
              return (
                <li key={tx.id}>
                  <Link href={`/transactions/${tx.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: cat?.color ?? '#71717a' }}
                    >
                      {categoryName(cat, t).slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                        <span className="truncate">{tx.description}</span>
                        {(tx.recurring || tx.parentId) && <span title={t('tx.recurring')}>↻</span>}
                        {tx.attachment && <span title={t('tx.attachment')}>📎</span>}
                      </div>
                      <div className="muted flex flex-wrap items-center gap-x-2 text-xs">
                        {compact && <span>{formatDate(tx.date)}</span>}
                        <span className="flex items-center gap-1">
                          <Dot color={cat?.color ?? '#71717a'} />
                          {categoryName(cat, t)}
                          {tx.subcategory ? ` · ${tx.subcategory}` : ''}
                        </span>
                        {tx.merchant && <span className="truncate">{tx.merchant}</span>}
                        <AccountBadge id={tx.account} label={accountName(tx.account, t)} size="xs" />
                        {tx.toAccount && (
                          <>
                            <span aria-hidden>→</span>
                            <AccountBadge id={tx.toAccount} label={accountName(tx.toAccount, t)} size="xs" />
                          </>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular-nums ${income ? 'text-emerald-600 dark:text-emerald-400' : transfer ? 'text-zinc-500 dark:text-zinc-400' : ''}`}
                    >
                      {income ? '+' : transfer ? '⇄ ' : '−'}
                      {formatMoney(tx.amount, locale)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
