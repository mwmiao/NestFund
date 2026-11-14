import { Sparkline } from '@/components/charts/Sparkline';
import { T212LiveStatus } from '@/components/portfolio/T212LiveStatus';
import { Badge, Card, EmptyState, Hint } from '@/components/ui';
import type { TFunction } from '@/i18n/config';
import { formatMoney, formatPercent } from '@/lib/format';
import { etfStatusText, type EtfSummary } from '@/lib/portfolio';
import type { T212Status } from '@/lib/t212';

/** Dashboard card: Trading 212 value, gain and a 30-day trend, with its sync state. */
export function InvestmentsCard({ etf, t212, trend, t, locale }: { etf: EtfSummary; t212: T212Status; trend: number[]; t: TFunction; locale: string }) {
  const money = (v: number) => formatMoney(v, locale);
  return (
    <Card
      title={
        <>
          {t('dashboard.investments')}
          <Hint text={t('glossary.etf')} />
        </>
      }
      className="lg:col-span-2"
      actions={
        t212.connected ? (
          <Badge tone={t212.lastError ? 'negative' : t212.stale ? 'caution' : 'positive'}>
            {t212.lastError ? t('t212.status.error') : t212.stale ? t('t212.stale') : t('t212.status.connected')}
          </Badge>
        ) : undefined
      }
    >
      {t212.connected && (
        <T212LiveStatus lastSyncAt={t212.lastSyncAt} lastChangedAt={t212.lastChangedAt} retryAt={t212.retryAt} needsAction={t212.needsAction} rateLimit={t212.rateLimit} />
      )}
      {etf.source !== 'none' ? (
        <>
          <div className="eyebrow">Trading 212</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{money(etf.value)}</div>
          <div className={`mt-0.5 text-sm tabular-nums ${etf.gain >= 0 ? 'text-positive' : 'text-negative'}`}>
            {formatMoney(etf.gain, locale, { sign: true })}
            {etf.invested > 0 && ` (${formatPercent(etf.growthPct, locale, 2)})`}
          </div>
          <div className="muted mt-1 text-xs">{etfStatusText(etf, t, locale)}</div>
          <div className="mt-3 text-brand-500">
            <Sparkline values={trend} />
          </div>
          <dl className="mt-3 border-t border-line pt-3 text-sm">
            <div>
              <dt className="eyebrow">{t('t212.investedCapital')}</dt>
              <dd className="tabular-nums">{money(etf.invested)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <EmptyState compact title={t('dashboard.noInvestments')} hint={t('dashboard.noInvestmentsHint')} action={{ href: '/settings#trading212', label: t('t212.connect') }} />
      )}
    </Card>
  );
}
