import Link from 'next/link';
import { deleteSnapshotAction, saveSnapshotAction } from '@/app/actions';
import { AccountBadge } from '@/components/AccountBadge';
import { LinesChart } from '@/components/charts/Charts';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Card, Empty, Field, PageHeader, Stat } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { grossMonthlyInterest, INTEREST_TAX_RATE } from '@/lib/calc';
import { formatDate, formatDateTime, todayISO } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { accountName } from '@/lib/labels';
import { accountBalances, listSnapshots, materializeRecurring } from '@/lib/repo';
import { getT212Status, listT212History } from '@/lib/t212';
import { ACCOUNTS, ACCOUNT_IDS } from '@/lib/types';

export default async function PortfolioPage() {
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  materializeRecurring();
  const balances = accountBalances();
  const snapshots = listSnapshots();
  const etf = balances.trading212;
  const tr = balances.traderepublic;
  const gain = etf.balance - etf.invested;
  const growth = etf.invested > 0 ? gain / etf.invested : 0;
  const netInterest = grossMonthlyInterest(tr.balance) * (1 - INTEREST_TAX_RATE);
  const t212 = getT212Status();
  const t212History = t212.connected || t212.lastSyncAt ? listT212History(30) : [];

  const series = (account: 'trading212' | 'traderepublic') =>
    snapshots.filter((s) => s.account === account).map((s) => ({ label: formatDate(s.date).slice(3), value: s.value, invested: s.invested }));
  const sectionTitle = (id: 'trading212' | 'traderepublic') => (
    <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide" style={{ color: ACCOUNTS[id].color }}>
      {accountName(id, t)} <span className="muted font-normal normal-case tracking-normal">· {t(`accounts.purpose.${id}`)}</span>
    </h2>
  );

  return (
    <>
      <PageHeader title={t('portfolio.title')} subtitle={t212.connected ? t('t212.portfolioSynced') : t('portfolio.noBroker')} />

      {sectionTitle('trading212')}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('portfolio.value')} value={money(etf.balance)} hint={etf.since ? t('portfolio.lastUpdate', { date: formatDate(etf.since) }) : undefined} />
        <Stat label={t('portfolio.invested')} value={money(etf.invested)} />
        <Stat label={t('portfolio.unrealized')} value={formatMoney(gain, locale, { sign: true })} tone={gain >= 0 ? 'positive' : 'negative'} />
        <Stat label={t('portfolio.growth')} value={formatPercent(growth, locale, 2)} tone={growth >= 0 ? 'positive' : 'negative'} />
      </div>
      <p className="muted mt-2 text-xs">
        {t212.connected ? (
          <>
            {t212.lastError ? <span className="text-red-500">{t(`t212.errors.${t212.lastError.code}`)} · </span> : null}
            {t212.lastSyncAt ? t('t212.lastSyncAt', { date: formatDateTime(t212.lastSyncAt, locale) }) : null}{' '}
            <Link href="/settings" className="text-brand-500 hover:underline">
              {t('settings.connections')}
            </Link>
          </>
        ) : (
          <Link href="/settings" className="text-brand-500 hover:underline">
            {t('t212.connectCta')}
          </Link>
        )}
      </p>

      {t212.positions.length > 0 && (
        <Card title={t('t212.positions')} className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="muted text-left text-xs">
                  <th className="pb-2 font-medium">{t('t212.instrument')}</th>
                  <th className="pb-2 text-right font-medium">{t('t212.quantity')}</th>
                  <th className="pb-2 text-right font-medium">{t('t212.averagePrice')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.value')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.unrealized')}</th>
                </tr>
              </thead>
              <tbody>
                {t212.positions.map((p) => (
                  <tr key={p.ticker} className="table-row">
                    <td className="py-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="muted text-xs">{p.ticker}</div>
                    </td>
                    <td className="py-2 text-right tabular-nums">{p.quantity.toLocaleString(locale, { maximumFractionDigits: 4 })}</td>
                    <td className="py-2 text-right tabular-nums">{Number.isFinite(p.averagePrice) ? p.averagePrice.toLocaleString(locale, { maximumFractionDigits: 2 }) : '—'}</td>
                    <td className="py-2 text-right tabular-nums">{money(p.value)}</td>
                    <td className={`py-2 text-right tabular-nums ${p.unrealized >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {formatMoney(p.unrealized, locale, { sign: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {t212History.length > 0 && (
        <Card title={t('t212.history')} className="mt-4">
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="sticky top-0 bg-white dark:bg-zinc-900">
                <tr className="muted text-left text-xs">
                  <th className="pb-2 font-medium">{t('common.date')}</th>
                  <th className="pb-2 text-right font-medium">{t('t212.totalValue')}</th>
                  <th className="pb-2 text-right font-medium">{t('t212.investedCapital')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.unrealized')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.growth')}</th>
                </tr>
              </thead>
              <tbody>
                {[...t212History].reverse().map((h) => (
                  <tr key={h.date} className="table-row">
                    <td className="py-2">{formatDate(h.date)}</td>
                    <td className="py-2 text-right tabular-nums">{money(h.totalValue)}</td>
                    <td className="py-2 text-right tabular-nums">{money(h.invested)}</td>
                    <td className={`py-2 text-right tabular-nums ${h.unrealized >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{formatMoney(h.unrealized, locale, { sign: true })}</td>
                    <td className="py-2 text-right tabular-nums">{formatPercent(h.growthPct, locale, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="mt-5">{sectionTitle('traderepublic')}</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('portfolio.value')} value={money(tr.balance)} hint={tr.since ? t('portfolio.lastUpdate', { date: formatDate(tr.since) }) : undefined} />
        <Stat label={t('accounts.estimatedInterest')} value={money(netInterest)} hint={t('sim.netNote', { tax: formatPercent(INTEREST_TAX_RATE, locale, 0) }).split('.')[0] + '.'} tone="positive" />
      </div>

      <h2 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-zinc-500">{t('accounts.title')}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(['ctt', 'revolut', 'meal_card', 'cash'] as const).map((id) => (
          <Stat key={id} label={accountName(id, t)} value={money(balances[id].balance)} hint={t(`accounts.purpose.${id}`)} />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title={`${t('portfolio.evolution')} · ${accountName('trading212', t)}`}>
            <LinesChart
              data={series('trading212')}
              xKey="label"
              series={[
                { key: 'value', name: t('portfolio.value'), color: ACCOUNTS.trading212.color },
                { key: 'invested', name: t('portfolio.invested'), color: '#6366f1' },
              ]}
            />
          </Card>
          <Card title={`${t('portfolio.evolution')} · ${accountName('traderepublic', t)}`}>
            <LinesChart data={series('traderepublic')} xKey="label" series={[{ key: 'value', name: t('portfolio.value'), color: ACCOUNTS.traderepublic.color }]} />
          </Card>
        </div>
        <Card title={t('accounts.checkIn')} id="check-in">
          <p className="muted mb-3 text-xs">{t('accounts.checkInHint')}</p>
          <form action={saveSnapshotAction} className="space-y-3">
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
            <Field label={`${t('portfolio.invested')} (€) · ${accountName('trading212', t)}`}>
              <input name="invested" inputMode="decimal" className="input tabular-nums" />
            </Field>
            <p className="muted text-xs">{t('portfolio.investedHint')}</p>
            <Field label={t('common.notes')}>
              <input name="notes" className="input" />
            </Field>
            <button className="btn-primary w-full">{t('common.save')}</button>
          </form>
        </Card>
      </div>

      <Card title={t('portfolio.history')} className="mt-4">
        {snapshots.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="muted text-left text-xs">
                  <th className="pb-2 font-medium">{t('common.date')}</th>
                  <th className="pb-2 font-medium">{t('portfolio.account')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.value')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.invested')}</th>
                  <th className="pb-2 text-right font-medium">{t('portfolio.unrealized')}</th>
                  <th>
                    <span className="sr-only">{t('common.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().map((s) => (
                  <tr key={s.id} className="table-row">
                    <td className="py-2">{formatDate(s.date)}</td>
                    <td className="py-2">
                      <AccountBadge id={s.account} label={accountName(s.account, t)} size="xs" />
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(s.value)}</td>
                    <td className="py-2 text-right tabular-nums">{s.account === 'trading212' ? money(s.invested) : '—'}</td>
                    <td className={`py-2 text-right tabular-nums ${s.value - s.invested >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {s.account === 'trading212' ? formatMoney(s.value - s.invested, locale, { sign: true }) : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <form action={deleteSnapshotAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmButton className="btn-danger !px-2 !py-1 text-xs">{t('common.delete')}</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{t('common.noData')}</Empty>
        )}
      </Card>
    </>
  );
}
