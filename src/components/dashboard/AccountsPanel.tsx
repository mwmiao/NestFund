'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveSnapshotAction, saveTransactionAction } from '@/app/actions';
import { Icon } from '@/components/layout/Icon';
import { Spinner } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { toInputDecimal } from '@/lib/format';
import { accountName } from '@/lib/labels';
import { ACCOUNTS, ACCOUNT_IDS, type AccountId } from '@/lib/types';

export interface AccountRow {
  id: AccountId;
  balance: number;
  invested: number; // Trading 212 cost basis, kept when the balance is updated by hand
  balanceText: string; // formatted on the server, or empty when there is no balance yet
  extraText?: string;
  extraTone?: 'positive' | 'negative' | 'muted';
  apiSynced?: boolean; // Trading 212 updated by the API: no manual balance field
}

export interface RecentTransfer {
  id: number;
  from: AccountId;
  to: AccountId;
  amountText: string;
  dateText: string;
}

const PENCIL = 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4';
const TRANSFER = 'M7 7h13l-3-3M17 17H4l3 3';
const toneClass = { positive: 'text-positive', negative: 'text-negative', muted: 'text-subtle' };

function Save({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary !px-3 !py-2" disabled={pending}>
      {pending ? <Spinner /> : label}
    </button>
  );
}

/** Dashboard account list: inline "update balance" per account and a quick transfer form. */
export function AccountsPanel({ rows, recentTransfers, today }: { rows: AccountRow[]; recentTransfers: RecentTransfer[]; today: string }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState<AccountId | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [from, setFrom] = useState<AccountId>('ctt');
  const [to, setTo] = useState<AccountId>('revolut');
  const [note, setNote] = useState('');

  return (
    <section className="card lg:col-span-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="section-title">{t('accounts.title')}</h2>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-ghost !px-2.5 !py-1.5 text-xs" aria-expanded={transferOpen} onClick={() => setTransferOpen((o) => !o)}>
            <Icon d={TRANSFER} className="h-4 w-4" />
            {t('dashboard.actions.transfer')}
          </button>
          <Link href="/portfolio" className="link px-1">
            {t('dashboard.seeAll')}
          </Link>
        </div>
      </div>

      {transferOpen && (
        <div className="mb-4 rounded-control border border-line bg-raised/50 p-3">
          <form action={saveTransactionAction} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_8rem]">
            <input type="hidden" name="type" value="transfer" />
            <input type="hidden" name="paymentMethod" value="transfer" />
            <input type="hidden" name="date" value={today} />
            <input type="hidden" name="back" value="/" />
            <input type="hidden" name="account" value={from} />
            <input type="hidden" name="toAccount" value={to} />
            <input type="hidden" name="description" value={note.trim() || `${accountName(from, t)} → ${accountName(to, t)}`} />
            <label className="block">
              <span className="label">{t('tx.fromAccount')}</span>
              <select
                value={from}
                onChange={(e) => {
                  const v = e.target.value as AccountId;
                  setFrom(v);
                  if (v === to) setTo(ACCOUNT_IDS.find((a) => a !== v) ?? 'ctt');
                }}
                className="input"
              >
                {ACCOUNT_IDS.map((a) => (
                  <option key={a} value={a}>
                    {accountName(a, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">{t('tx.toAccount')}</span>
              <select value={to} onChange={(e) => setTo(e.target.value as AccountId)} className="input">
                {ACCOUNT_IDS.filter((a) => a !== from).map((a) => (
                  <option key={a} value={a}>
                    {accountName(a, t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 block sm:col-span-1">
              <span className="label">{t('common.amount')} (€)</span>
              <input name="amount" required inputMode="decimal" placeholder="0,00" pattern="[0-9.,\s]*[0-9][0-9.,\s]*" className="input tabular-nums" />
            </label>
            <label className="col-span-2 block sm:col-span-3">
              <span className="label">
                {t('tx.description')} ({t('common.optional')})
              </span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`${accountName(from, t)} → ${accountName(to, t)}`} className="input" />
            </label>
            <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 sm:col-span-3">
              <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => setTransferOpen(false)}>
                {t('common.cancel')}
              </button>
              <Save label={t('dashboard.saveTransfer')} />
            </div>
          </form>

          {recentTransfers.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="eyebrow mb-1">{t('dashboard.recentTransfers')}</div>
              <ul className="divide-y divide-line/70">
                {recentTransfers.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {accountName(r.from, t)} → {accountName(r.to, t)}
                      <span className="muted"> · {r.dateText}</span>
                    </span>
                    <span className="shrink-0 tabular-nums">{r.amountText}</span>
                    <Link href={`/transactions/${r.id}`} className="link shrink-0 !text-xs">
                      {t('common.edit')}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <ul className="-my-1 divide-y divide-line/70">
        {rows.map((row) => {
          const meta = ACCOUNTS[row.id];
          const isEditing = editing === row.id;
          return (
            <li key={row.id} className="py-1">
              <div className="flex items-center gap-2">
                <Link href={`/transactions?account=${row.id}`} className="-ml-2 flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-2 transition hover:bg-raised/60">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold" style={{ background: `${meta.color}1f`, color: meta.color }} aria-hidden>
                    {accountName(row.id, t).charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug">{accountName(row.id, t)}</span>
                    <span className="muted block truncate text-xs">{t(`accounts.purpose.${row.id}`)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={`block text-sm font-semibold tabular-nums ${row.balance < 0 ? 'text-negative' : ''}`}>
                      {row.balanceText || <span className="muted font-normal">{t('accounts.noCheckIn')}</span>}
                    </span>
                    {row.extraText && <span className={`block text-[11px] tabular-nums ${toneClass[row.extraTone ?? 'muted']}`}>{row.extraText}</span>}
                  </span>
                </Link>
                <button
                  type="button"
                  aria-expanded={isEditing}
                  aria-label={t('dashboard.updateBalanceOf', { account: accountName(row.id, t) })}
                  title={t('dashboard.updateBalance')}
                  onClick={() => setEditing(isEditing ? null : row.id)}
                  className={`btn-ghost shrink-0 !p-2 ${isEditing ? 'bg-raised text-ink' : ''}`}
                >
                  <Icon d={PENCIL} className="h-4 w-4" />
                </button>
              </div>

              {isEditing && (
                <div className="mb-2 ml-12 rounded-control border border-line bg-raised/50 p-3">
                  {row.apiSynced ? (
                    <p className="muted text-xs">
                      {t('dashboard.apiSyncedHint')}{' '}
                      <Link href="/settings" className="link !text-xs">
                        {t('t212.syncNow')}
                      </Link>
                    </p>
                  ) : (
                    <form action={saveSnapshotAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="account" value={row.id} />
                      <input type="hidden" name="date" value={today} />
                      <input type="hidden" name="back" value="/" />
                      <label className="block min-w-[8rem] flex-1">
                        <span className="label">{t('dashboard.currentBalance')} (€)</span>
                        <input name="value" required inputMode="decimal" autoFocus defaultValue={row.balanceText ? toInputDecimal(row.balance) : ''} className="input tabular-nums" />
                      </label>
                      {row.id === 'trading212' && (
                        <label className="block min-w-[8rem] flex-1">
                          <span className="label">{t('t212.investedCapital')} (€)</span>
                          <input name="invested" inputMode="decimal" defaultValue={row.invested ? toInputDecimal(row.invested) : ''} className="input tabular-nums" />
                        </label>
                      )}
                      <div className="flex gap-2">
                        <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => setEditing(null)}>
                          {t('common.cancel')}
                        </button>
                        <Save label={t('common.save')} />
                      </div>
                      <p className="muted basis-full text-[11px]">{t('dashboard.updateBalanceHint')}</p>
                    </form>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 border-t border-line pt-2 text-xs">
                    <button
                      type="button"
                      className="link !text-xs"
                      onClick={() => {
                        setFrom(row.id);
                        setTo(row.id === 'ctt' ? 'revolut' : 'ctt');
                        setTransferOpen(true);
                        setEditing(null);
                      }}
                    >
                      {t('dashboard.transferFromHere')}
                    </button>
                    <Link href={`/transactions?account=${row.id}`} className="link !text-xs">
                      {t('dashboard.seeMovements')}
                    </Link>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
