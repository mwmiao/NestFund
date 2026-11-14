import Link from 'next/link';
import { saveAccountVisibilityAction } from '@/app/actions';
import { OfflineDataCard } from '@/components/pwa/OfflineDataCard';
import { T212Actions, T212ConnectForm } from '@/components/settings/T212Connection';
import { Alert, Badge, Card, PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';
import { formatDateTime } from '@/lib/dates';
import { formatMoney, formatPercent } from '@/lib/format';
import { accountName } from '@/lib/labels';
import { getHiddenAccounts } from '@/lib/repo';
import { getT212Status } from '@/lib/t212';
import { ACCOUNTS, ACCOUNT_IDS } from '@/lib/types';
import { SubmitButton } from '@/components/SubmitButton';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ accounts?: string }> }) {
  const sp = await searchParams;
  const hidden = new Set(getHiddenAccounts());
  const { t, locale } = await getI18n();
  const money = (v: number) => formatMoney(v, locale);
  const s = getT212Status();
  const status: 'connected' | 'error' | 'stale' | 'off' = !s.connected ? 'off' : s.lastError ? 'error' : s.stale ? 'stale' : 'connected';
  const badgeTone = { connected: 'positive', error: 'negative', stale: 'caution', off: 'muted' } as const;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('settings.title')} />

      {!process.env.BASIC_AUTH_USER && (
        <div className="mb-6">
          <Alert tone="info">{t('settings.noAuth')}</Alert>
        </div>
      )}

      <h2 className="section-title mb-3">{t('settings.connections')}</h2>
      <Card id="trading212" className="mb-6">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCOUNTS.trading212.color }} aria-hidden />
              Trading 212
            </h3>
            <p className="muted text-sm">{t('t212.description')}</p>
          </div>
          <Badge tone={badgeTone[status]}>{status === 'stale' ? t('t212.stale') : t(`t212.status.${status}`)}</Badge>
        </div>

        {s.connected && (
          <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="eyebrow">{t('t212.lastSync')}</dt>
              <dd>{s.lastSyncAt ? formatDateTime(s.lastSyncAt, locale) : '—'}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('t212.nextSync')}</dt>
              <dd>{s.nextSyncAt ? formatDateTime(s.nextSyncAt, locale) : s.needsAction ? t('t212.waitingForYou') : '—'}</dd>
            </div>
            <div>
              <dt className="eyebrow">{t('t212.key')}</dt>
              <dd className="font-mono">
                ••••{s.keyHint} · {s.env === 'demo' ? t('t212.envDemo') : t('t212.envLive')}
              </dd>
            </div>
            {s.metrics && (
              <div>
                <dt className="eyebrow">{t('portfolio.value')}</dt>
                <dd className="tabular-nums">
                  {money(s.metrics.totalValue)} <span className="muted">({formatPercent(s.metrics.growthPct, locale, 2)})</span>
                </dd>
              </div>
            )}
          </dl>
        )}

        {s.connected && s.lastError && (
          <div className="mb-4">
            <Alert tone={s.needsAction ? 'warning' : 'info'}>
              <p className="font-medium">{t(`t212.errors.${s.lastError.code}`)}</p>
              <p className="muted mt-0.5 text-xs">
                {formatDateTime(s.lastError.at, locale)}
                {s.lastError.status ? ` · HTTP ${s.lastError.status}` : ''} · {s.needsAction ? t('t212.needsAction') : t('t212.willRetry')} {t('t212.fallback')}
              </p>
            </Alert>
          </div>
        )}
        {s.connected && !s.lastError && s.positionsError && <p className="mb-4 text-sm text-caution">{t('t212.positionsWarning')}</p>}

        {s.connected ? (
          <>
            <T212Actions />
            <details className="mt-4 rounded-xl border border-line px-3 py-2">
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

        <ul className="muted mt-5 space-y-1 border-t border-line pt-4 text-xs">
          <li>🔒 {t('t212.securityStorage')}</li>
          <li>👁 {t('t212.securityReadOnly')}</li>
          <li>↻ {t('t212.securitySchedule')}</li>
        </ul>
      </Card>

      <h2 className="section-title mb-3">{t('settings.dataSection')}</h2>
      <Card className="mb-6">
        <p className="muted mb-4 text-sm">{t('settings.dataHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/settings/backup" className="btn-secondary">
            {t('backup.openPage')}
          </Link>
          <Link href="/settings/notifications" className="btn-secondary">
            {t('notifications.settingsTitle')}
          </Link>
        </div>
      </Card>

      <h2 id="accounts" className="section-title mb-3 scroll-mt-20">
        {t('settings.accountsTitle')}
      </h2>
      <Card className="mb-6">
        <p className="muted mb-4 text-sm">{t('settings.accountsHint')}</p>
        {sp.accounts === 'saved' && (
          <div className="mb-4">
            <Alert tone="success">{t('common.saved')}</Alert>
          </div>
        )}
        {sp.accounts === 'none' && (
          <div className="mb-4">
            <Alert tone="warning">{t('settings.accountsKeepOne')}</Alert>
          </div>
        )}
        <form action={saveAccountVisibilityAction} className="space-y-3">
          <ul className="grid gap-2 sm:grid-cols-2">
            {ACCOUNT_IDS.map((a) => (
              <li key={a}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line px-3 py-2 text-sm">
                  <input type="checkbox" name="show" value={a} defaultChecked={!hidden.has(a)} className="h-4 w-4 accent-emerald-600" />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCOUNTS[a].color }} aria-hidden />
                  <span className="flex-1">{accountName(a, t)}</span>
                </label>
              </li>
            ))}
          </ul>
          <SubmitButton className="btn-primary">{t('common.save')}</SubmitButton>
        </form>
      </Card>

      <h2 className="section-title mb-3">{t('settings.general')}</h2>
      <Card className="mb-6">
        <ul className="divide-y divide-line/70 text-sm">
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
            <Link href="/setup#reset" className="flex items-center justify-between py-3 text-negative hover:opacity-80">
              {t('setup.resetTitle')} <span aria-hidden>›</span>
            </Link>
          </li>
        </ul>
      </Card>

      <h2 className="section-title mb-3">{t('pwa.title')}</h2>
      <Card>
        <OfflineDataCard />
      </Card>
    </div>
  );
}
