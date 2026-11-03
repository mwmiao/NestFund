import Link from 'next/link';
import { ProgressBar } from '@/components/ui';
import type { TFunction } from '@/i18n/config';
import type { AccountBalance, AccountMovements } from '@/lib/calc';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { accountName } from '@/lib/labels';
import { ACCOUNTS, type AccountId } from '@/lib/types';

export interface AccountCardData {
  id: AccountId;
  balance: AccountBalance;
  month: AccountMovements;
  /** Planned monthly transfer into this account (leisure / ETF / savings lines). */
  plannedIn: number;
  /** Actual transfers into this account this month. */
  transferredIn: number;
  /** Optional budget progress shown under the balance (Revolut leisure, meal card). */
  progress?: { spent: number; budget: number; label: string };
}

export function AccountCards({ accounts, month, locale, t }: { accounts: AccountCardData[]; month: string; locale: string; t: TFunction }) {
  const money = (v: number) => formatMoney(v, locale);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {accounts.map((a) => {
        const meta = ACCOUNTS[a.id];
        return (
          <Link
            key={a.id}
            href={`/transactions?month=${month}&account=${a.id}`}
            className="card block border-l-4 transition hover:-translate-y-0.5 hover:shadow-md"
            style={{ borderLeftColor: meta.color }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: meta.color }}>
                {accountName(a.id, t)}
              </span>
            </div>
            <div className="muted text-xs">{t(`accounts.purpose.${a.id}`)}</div>
            <div className={`mt-2 text-xl font-semibold tabular-nums ${a.balance.balance < 0 ? 'text-red-500' : ''}`}>{money(a.balance.balance)}</div>
            <div className="muted mt-0.5 text-[11px]">
              {a.balance.since ? t('accounts.since', { date: formatDate(a.balance.since) }) : t('accounts.noCheckIn')}
            </div>
            <div className="mt-2 text-xs tabular-nums">{t('accounts.thisMonth', { in: money(a.month.inflow), out: money(a.month.outflow) })}</div>
            {a.plannedIn > 0 && (
              <div className={`mt-1 text-xs tabular-nums ${a.transferredIn >= a.plannedIn ? 'text-emerald-500' : 'text-amber-500'}`}>
                {t('accounts.planned', { planned: money(a.plannedIn), done: money(a.transferredIn) })}
              </div>
            )}
            {a.progress && a.progress.budget > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-xs tabular-nums">{a.progress.label}</div>
                <ProgressBar value={a.progress.spent / a.progress.budget} color={meta.color} over={a.progress.spent > a.progress.budget} />
              </div>
            )}
          </Link>
        );
      })}
    </div>
  );
}
