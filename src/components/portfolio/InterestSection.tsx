import { saveInterestConfigAction } from '@/app/interest-actions';
import { getI18n } from '@/i18n/server';
import { formatDate, monthLabel, todayISO } from '@/lib/dates';
import { formatMoney, formatPercent, toInputDecimal } from '@/lib/format';
import { interestView } from '@/lib/interest-repo';

/** Trade Republic interest: daily accrual, credited once a month, net of IRS. Estimates; the bank's own figures win. */
export async function InterestSection() {
  const { t, locale } = await getI18n();
  const { config, overview: o, credits } = interestView(todayISO());
  const m = (v: number, decimals = 2) => formatMoney(v, locale, { decimals });
  const pct = (v: number) => formatPercent(v, locale, Math.abs(v * 100 - Math.round(v * 100)) < 1e-9 ? 0 : 2);
  const differsTomorrow = o != null && Math.abs(o.dailyGrossTomorrow - o.dailyGrossToday) >= 0.00005;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="section-title">{t('interest.title')}</h3>

      {o ? (
        <>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="eyebrow">{t('interest.annualRate')}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{pct(config.annualRate)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('interest.tax')}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{pct(config.taxRate)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('interest.dailyGross')}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{m(o.dailyGrossToday, 4)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('interest.dailyNet')}</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-positive">{m(o.dailyNetToday, 4)}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('interest.accruedMonth')}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                <span className="text-positive">{m(o.accruedNet)}</span>
                <span className="muted text-xs"> · {t('interest.grossAmount', { amount: m(o.accruedGross) })}</span>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('interest.expectedCredit')}</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                <span className="text-positive">{m(o.monthNet)}</span>
                <span className="muted text-xs">
                  {' '}
                  · {t('interest.grossAmount', { amount: m(o.monthGross) })} · {t('interest.taxAmount', { amount: m(o.monthTax) })}
                </span>
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="eyebrow">{t('interest.nextCredit')}</dt>
              <dd className="mt-0.5 font-medium">
                {formatDate(o.creditDate)} <span className="muted text-xs">· {t('interest.inDays', { n: o.daysToCredit })}</span>
              </dd>
            </div>
          </dl>
          {differsTomorrow && (
            <p className="mt-3 rounded-control bg-raised px-3 py-2 text-xs">
              {t('interest.fromTomorrow', { gross: m(o.dailyGrossTomorrow, 4), net: m(o.dailyNetTomorrow, 4), base: m(o.baseTomorrow) })}
            </p>
          )}
        </>
      ) : (
        <p className="muted mt-2 text-sm">{t('interest.disabled')}</p>
      )}

      <p className="muted mt-3 text-xs">{t('interest.explanation', { tax: pct(config.taxRate) })}</p>

      {credits.length > 0 && (
        <details className="mt-3">
          <summary className="link inline-flex cursor-pointer select-none">{t('interest.history')}</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-xs tabular-nums">
              <thead>
                <tr className="muted text-right">
                  <th className="py-1 text-left font-medium">{t('interest.month')}</th>
                  <th className="py-1 font-medium">{t('interest.opening')}</th>
                  <th className="py-1 font-medium">{t('interest.deposits')}</th>
                  <th className="py-1 font-medium">{t('interest.withdrawals')}</th>
                  <th className="py-1 font-medium">{t('interest.gross')}</th>
                  <th className="py-1 font-medium">{t('interest.irs')}</th>
                  <th className="py-1 font-medium">{t('interest.net')}</th>
                  <th className="py-1 font-medium">{t('interest.closing')}</th>
                </tr>
              </thead>
              <tbody>
                {credits.map((c) => (
                  <tr key={c.month} className="table-row text-right">
                    <td className="py-1.5 text-left">{monthLabel(c.month, locale, 'short')}</td>
                    <td>{m(c.opening)}</td>
                    <td>{m(c.deposits)}</td>
                    <td>{m(c.withdrawals)}</td>
                    <td>{m(c.gross)}</td>
                    <td>{m(c.tax)}</td>
                    <td className="font-medium text-positive">{m(c.net)}</td>
                    <td>{m(c.closing)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted mt-2 text-xs">{t('interest.historyNote')}</p>
        </details>
      )}

      <details className="mt-3">
        <summary className="link inline-flex cursor-pointer select-none">{t('interest.configure')}</summary>
        <form action={saveInterestConfigAction} className="mt-3 grid grid-cols-2 gap-3">
          <label className="col-span-2 flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" value="1" defaultChecked={config.enabled} className="h-4 w-4 accent-emerald-600" />
            {t('interest.enabled')}
          </label>
          <label className="block">
            <span className="label">{t('interest.annualRate')} (%)</span>
            <input name="annualRate" inputMode="decimal" defaultValue={toInputDecimal(config.annualRate * 100)} className="input" />
          </label>
          <label className="block">
            <span className="label">{t('interest.tax')} (%)</span>
            <input name="taxRate" inputMode="decimal" defaultValue={toInputDecimal(config.taxRate * 100)} className="input" />
          </label>
          <label className="block">
            <span className="label">{t('interest.depositLag')}</span>
            <select name="depositLagDays" defaultValue={config.depositLagDays} className="input">
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {t(`interest.lag.${n === 0 ? 'sameDay' : n === 1 ? 'nextDay' : 'days'}`, { n })}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">{t('interest.withdrawalLag')}</span>
            <select name="withdrawalLagDays" defaultValue={config.withdrawalLagDays} className="input">
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {t(`interest.lag.${n === 0 ? 'sameDay' : n === 1 ? 'nextDay' : 'days'}`, { n })}
                </option>
              ))}
            </select>
          </label>
          <p className="muted col-span-2 text-xs">{t('interest.configureHint')}</p>
          <button className="btn-secondary col-span-2 sm:col-span-1 sm:justify-self-start">{t('common.save')}</button>
        </form>
      </details>
    </div>
  );
}
