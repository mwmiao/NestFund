import Link from 'next/link';
import { T212Actions, T212ConnectForm } from '@/components/settings/T212Connection';
import { Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { formatDateTime } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { getT212Status } from '@/lib/t212';

export default async function SettingsPage() {
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  const s = getT212Status();
  const status: 'connected' | 'error' | 'off' = !s.connected ? 'off' : s.lastError ? 'error' : 'connected';
  const badge = {
    connected: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    error: 'bg-red-500/15 text-red-600 dark:text-red-400',
    off: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  }[status];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('settings.title')} />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('settings.connections')}</h2>
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold" style={{ color: '#06b6d4' }}>
              Trading 212
            </h3>
            <p className="muted text-sm">{t('t212.description')}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge}`}>{t(`t212.status.${status}`)}</span>
        </div>

        {s.connected && (
          <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="muted text-xs">{t('t212.lastSync')}</dt>
              <dd>{s.lastSyncAt ? formatDateTime(s.lastSyncAt, locale) : '—'}</dd>
            </div>
            <div>
              <dt className="muted text-xs">{t('t212.nextSync')}</dt>
              <dd>{s.nextSyncAt ? formatDateTime(s.nextSyncAt, locale) : '—'}</dd>
            </div>
            <div>
              <dt className="muted text-xs">{t('t212.key')}</dt>
              <dd className="font-mono">
                ••••{s.keyHint} · {s.env === 'demo' ? t('t212.envDemo') : t('t212.envLive')}
              </dd>
            </div>
            {s.metrics && (
              <div>
                <dt className="muted text-xs">{t('portfolio.value')}</dt>
                <dd className="tabular-nums">
                  {money(s.metrics.totalValue)} <span className="muted">({formatPercent(s.metrics.growthPct, locale, 2)})</span>
                </dd>
              </div>
            )}
          </dl>
        )}

        {s.connected && s.lastError && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-medium">{t(`t212.errors.${s.lastError.code}`)}</p>
            <p className="mt-0.5 text-xs opacity-80">
              {formatDateTime(s.lastError.at, locale)}
              {s.lastError.status ? ` · HTTP ${s.lastError.status}` : ''} · {t('t212.fallback')}
            </p>
          </div>
        )}
        {s.connected && !s.lastError && s.positionsError && <p className="mb-4 text-sm text-amber-600 dark:text-amber-400">{t('t212.positionsWarning')}</p>}

        {s.connected ? (
          <>
            <T212Actions />
            <details className="mt-4 rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
              <summary className="cursor-pointer select-none py-1 text-sm font-medium">{t('t212.replaceTitle')}</summary>
              <div className="pb-2 pt-3">
                <T212ConnectForm env={s.env} replacing />
              </div>
            </details>
          </>
        ) : (
          <>
            <ol className="muted mb-4 list-decimal space-y-1 pl-5 text-sm">
              <li>{t('t212.step1')}</li>
              <li>{t('t212.step2')}</li>
              <li>{t('t212.step3')}</li>
            </ol>
            <T212ConnectForm env={s.env} />
          </>
        )}

        <ul className="muted mt-5 space-y-1 border-t border-zinc-100 pt-4 text-xs dark:border-zinc-800">
          <li>🔒 {t('t212.securityStorage')}</li>
          <li>👁 {t('t212.securityReadOnly')}</li>
          <li>↻ {t('t212.securitySchedule')}</li>
        </ul>
      </Card>

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('settings.general')}</h2>
      <Card>
        <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          <li>
            <Link href="/setup" className="flex items-center justify-between py-3 hover:text-brand-500">
              {t('setup.title')} <span aria-hidden>›</span>
            </Link>
          </li>
          <li>
            <Link href="/transactions/categories" className="flex items-center justify-between py-3 hover:text-brand-500">
              {t('nav.categories')} <span aria-hidden>›</span>
            </Link>
          </li>
          <li>
            <Link href="/setup#reset" className="flex items-center justify-between py-3 text-red-600 hover:text-red-500 dark:text-red-400">
              {t('setup.resetTitle')} <span aria-hidden>›</span>
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
