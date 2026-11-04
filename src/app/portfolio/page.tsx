import Link from 'next/link';
import { deleteSnapshotAction, saveSnapshotAction } from '@/app/actions';
import { AccountBadge } from '@/components/AccountBadge';
import { LinesChart } from '@/components/charts/LazyCharts';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Alert, Badge, Card, Empty, Field, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { INTEREST_TAX_RATE, grossMonthlyInterest } from '@/lib/calc';
import { formatDate, formatDateTime, formatRelative, todayISO } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { accountName } from '@/lib/labels';
import { etfSummary } from '@/lib/portfolio';
import { accountBalances, listSnapshots, materializeRecurring } from '@/lib/repo';
import { getT212Status, listT212History } from '@/lib/t212';
import { ACCOUNTS, ACCOUNT_IDS } from '@/lib/types';

const dayMonth = (iso: string) => formatDate(iso).slice(0, 5);

export default async function PortfolioPage() {
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  materializeRecurring();
  const balances = accountBalances();
  const snapshots = listSnapshots();
  const t212 = getT212Status();
  const etf = etfSummary(balances.trading212, t212);
  const tr = balances.traderepublic;
  const netInterest = grossMonthlyInterest(tr.balance) * (1 - INTEREST_TAX_RATE);

  // Daily API history when there is enough of it; manual check-ins otherwise.
  const apiHistory = listT212History(365);
  const etfChart =
    apiHistory.length >= 2
      ? apiHistory.map((h) => ({ label: dayMonth(h.date), value: h.totalValue, invested: h.invested }))
      : snapshots.filter((s) => s.account === 'trading212').map((s) => ({ label: dayMonth(s.date), value: s.value, invested: s.invested }));
  const trChart = snapshots.filter((s) => s.account === 'traderepublic').map((s) => ({ label: dayMonth(s.date), value: s.value }));

  const syncBadge = !t212.connected ? null : t212.lastError ? (
    <Badge tone="negative">{t('t212.status.error')}</Badge>
  ) : t212.stale ? (
    <Badge tone="caution">{t('t212.stale')}</Badge>
  ) : (
    <Badge tone="positive">{t('t212.status.connected')}</Badge>
  );

  return (
    <>
      <PageHeader title={t('portfolio.title')} subtitle={t212.connected ? t('t212.portfolioSynced') : t('portfolio.noBroker')} />

      {/* Trading 212 */}
      <section className="card mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: ACCOUNTS.trading212.color }} aria-hidden />
              Trading 212 · {t('accounts.purpose.trading212')}
            </div>
            <div className="mt-2 text-[2.25rem] font-semibold leading-tight tracking-tight tabular-nums">{money(etf.value)}</div>
            {etf.invested > 0 && (
              <div className={`mt-1 text-sm font-medium tabular-nums ${etf.gain >= 0 ? 'text-positive' : 'text-negative'}`}>
                {formatMoney(etf.gain, locale, { sign: true })} · {formatPercent(etf.growthPct, locale, 2)}
              </div>
            )}
          </div>
          <div className="text-right text-xs">
            {syncBadge}
            <div className="muted mt-1.5">
              {etf.source === 'api' && etf.asOf
                ? t('t212.updatedRelative', { when: formatRelative(etf.asOf, locale) })
                : etf.asOf
                  ? t('portfolio.lastUpdate', { date: formatDate(etf.asOf) })
                  : t('accounts.noCheckIn')}
            </div>
            <Link href="/settings" className="link mt-1 inline-block !text-xs">
              {t212.connected ? t('t212.manage') : t('t212.connectCta')}
            </Link>
          </div>
        </div>

        {t212.connected && t212.lastError && (
          <div className="mt-4">
            <Alert tone={t212.needsAction ? 'warning' : 'info'}>
              <span className="font-medium">{t(`t212.errors.${t212.lastError.code}`)}</span> {t('t212.fallback')}
            </Alert>
          </div>
        )}
        {etf.source === 'api' && etf.currency !== 'EUR' && <p className="mt-3 text-xs text-caution">{t('t212.currencyNote', { currency: etf.currency })}</p>}

        <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="eyebrow">{t('t212.investedCapital')}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{money(etf.invested)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('portfolio.unrealized')}</dt>
            <dd className={`mt-0.5 font-medium tabular-nums ${etf.gain >= 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(etf.gain, locale, { sign: true })}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('portfolio.growth')}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{formatPercent(etf.growthPct, locale, 2)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('t212.freeCash')}</dt>
            <dd className="mt-0.5 font-medium tabular-nums">{etf.source === 'api' ? money(etf.cash) : '—'}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <div className="eyebrow mb-2">{t('portfolio.evolution')}</div>
          <LinesChart
            data={etfChart}
            xKey="label"
            height={220}
            series={[
              { key: 'value', name: t('t212.totalValue'), color: ACCOUNTS.trading212.color },
              { key: 'invested', name: t('t212.investedCapital'), color: '#8b8b96' },
            ]}
          />
        </div>
      </section>

      {t212.positions.length > 0 && (
        <Card title={t('t212.positions')} subtitle={t212.lastSyncAt ? t('t212.lastSyncAt', { date: formatDateTime(t212.lastSyncAt, locale) }) : undefined} className="mb-4">
          <ul className="divide-y divide-line/70">
            {t212.positions.map((p) => (
              <li key={p.ticker} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="muted text-xs tabular-nums">
                    {p.ticker} · {p.quantity.toLocaleString(locale, { maximumFractionDigits: 4 })} × {Number.isFinite(p.averagePrice) ? p.averagePrice.toLocaleString(locale, { maximumFractionDigits: 2 }) : '—'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular-nums">{money(p.value)}</div>
                  <div className={`text-xs tabular-nums ${p.unrealized >= 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(p.unrealized, locale, { sign: true })}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        {/* Trade Republic */}
        <Card title="Trade Republic" subtitle={t('accounts.purpose.traderepublic')}>
          <div className="text-2xl font-semibold tabular-nums tracking-tight">{money(tr.balance)}</div>
          <div className="muted mt-1 text-xs">{tr.since ? t('portfolio.lastUpdate', { date: formatDate(tr.since) }) : t('accounts.noCheckIn')}</div>
          {tr.balance > 0 && (
            <p className="mt-3 text-sm">
              <span className="muted">{t('accounts.estimatedInterest')}: </span>
              <span className="font-medium tabular-nums text-positive">{money(netInterest)}</span>
              <span className="muted"> · {t('portfolio.netOfTax', { tax: formatPercent(INTEREST_TAX_RATE, locale, 0) })}</span>
            </p>
          )}
          <div className="mt-4">
            <LinesChart data={trChart} xKey="label" height={160} series={[{ key: 'value', name: t('portfolio.value'), color: ACCOUNTS.traderepublic.color }]} />
          </div>
        </Card>

        {/* Day-to-day accounts */}
        <Card title={t('portfolio.otherAccounts')}>
          <ul className="divide-y divide-line/70">
            {(['ctt', 'revolut', 'meal_card', 'cash'] as const).map((id) => (
              <li key={id} className="flex items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <AccountBadge id={id} label={accountName(id, t)} />
                  <span className="muted mt-1 block truncate text-xs">{t(`accounts.purpose.${id}`)}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{money(balances[id].balance)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <details className="card mb-4 scroll-mt-20" id="check-in">
        <summary className="section-title cursor-pointer select-none">{t('accounts.checkIn')}</summary>
        <p className="muted mt-2 text-xs">{t('accounts.checkInHint')}</p>
        <form action={saveSnapshotAction} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={t('portfolio.account')}>
            <select name="account" className="input">
              {ACCOUNT_IDS.map((a) => (
                <option key={a} value={a}>
                  {accountName(a, t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('common.date')}>
            <input type="date" name="date" defaultValue={todayISO()} className="input" />
          </Field>
          <Field label={`${t('portfolio.value')} (€)`}>
            <input name="value" required inputMode="decimal" className="input tabular-nums" />
          </Field>
          <Field label={`${t('portfolio.invested')} (€) · Trading 212`}>
            <input name="invested" inputMode="decimal" className="input tabular-nums" />
          </Field>
          <Field label={t('common.notes')} className="sm:col-span-2">
            <input name="notes" className="input" />
          </Field>
          <p className="muted text-xs sm:col-span-2">{t('portfolio.investedHint')}</p>
          <div className="sm:col-span-2">
            <button className="btn-primary">{t('common.save')}</button>
          </div>
        </form>
      </details>

      {apiHistory.length > 0 && (
        <details className="card mb-4">
          <summary className="section-title cursor-pointer select-none">{t('t212.history')}</summary>
          <div className="mt-4 max-h-80 overflow-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="muted text-left text-xs">
                  <th className="pb-2 font-medium">{t('common.date')}</th>
                  <th className="pb-2 text-right font-medium">{t('t212.totalValue')}</th>
                  <th className="pb-2 text-right font-medium">{t('t212.investedCapital')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.unrealized')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.growth')}</th>
                </tr>
              </thead>
              <tbody>
                {[...apiHistory].reverse().map((h) => (
                  <tr key={h.date} className="table-row">
                    <td className="py-2">{formatDate(h.date)}</td>
                    <td className="py-2 text-right tabular-nums">{money(h.totalValue)}</td>
                    <td className="py-2 text-right tabular-nums">{money(h.invested)}</td>
                    <td className={`py-2 text-right tabular-nums ${h.unrealized >= 0 ? 'text-positive' : 'text-negative'}`}>{formatMoney(h.unrealized, locale, { sign: true })}</td>
                    <td className="py-2 text-right tabular-nums">{formatPercent(h.growthPct, locale, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <details className="card">
        <summary className="section-title cursor-pointer select-none">{t('portfolio.history')}</summary>
        {snapshots.length ? (
          // A list (not a wide table) so the delete action is always visible on a phone.
          <ul className="mt-3 divide-y divide-line/70">
            {[...snapshots].reverse().map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <AccountBadge id={s.account} label={accountName(s.account, t)} size="xs" />
                    {s.notes === 'auto:trading212' && <span className="muted text-[11px]">API</span>}
                  </div>
                  <div className="muted mt-0.5 text-xs">{formatDate(s.date)}</div>
                </div>
                <span className="shrink-0 font-medium tabular-nums">{money(s.value)}</span>
                <form action={deleteSnapshotAction} className="shrink-0">
                  <input type="hidden" name="id" value={s.id} />
                  <ConfirmButton className="btn-danger !px-2.5 !py-1.5 text-xs">{t('common.delete')}</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>{t('common.noData')}</Empty>
        )}
      </details>
    </>
  );
}
