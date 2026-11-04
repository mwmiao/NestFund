'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { pollT212Action } from '@/app/actions';
import { useI18n } from '@/i18n/client';
import { IDLE_AFTER_MS, T212Poller, type PollerState } from '@/lib/t212-polling';

interface Props {
  lastSyncAt: string | null;
  lastChangedAt: string | null;
  retryAt: string | null;
  needsAction: boolean;
  rateLimit: { limit?: number; remaining?: number } | null;
}

const fmt = (ms: number, locale: string) => new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(ms);
const fmtTime = (ms: number, locale: string) => new Intl.DateTimeFormat(locale, { timeStyle: 'medium' }).format(ms);

/**
 * Keeps Trading 212 data fresh while this page is open: every 60 s when visible and in use,
 * every 6 h when hidden / locked / idle, and right away when the user comes back (if the last
 * check is older than 60 s). Shows last update, next planned update and connection state.
 */
export function T212LiveStatus({ lastSyncAt, lastChangedAt, retryAt, needsAction, rateLimit }: Props) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const refreshRef = useRef(router.refresh);
  refreshRef.current = router.refresh;
  const pollerRef = useRef<T212Poller | null>(null);
  const [state, setState] = useState<PollerState | null>(null);

  useEffect(() => {
    const poller = new T212Poller(
      {
        sync: (manual) => pollT212Action(manual),
        onState: (s) => setState(s),
        onChanged: () => refreshRef.current(),
      },
      { lastSyncAt, lastChangedAt, retryAt, needsAction, visible: document.visibilityState === 'visible' },
    );
    pollerRef.current = poller;
    poller.start();

    const onVisibility = () => poller.setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onVisibility);
    window.addEventListener('focus', onVisibility);

    // Idle device: no input for a while counts as inactive, the first input wakes it up again.
    let idleTimer: ReturnType<typeof setTimeout>;
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => poller.setIdle(true), IDLE_AFTER_MS);
    };
    const onActivity = () => {
      poller.setIdle(false);
      armIdle();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    armIdle();

    return () => {
      poller.stop();
      pollerRef.current = null;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onVisibility);
      window.removeEventListener('focus', onVisibility);
      events.forEach((e) => window.removeEventListener(e, onActivity));
      clearTimeout(idleTimer);
    };
    // The poller owns its state after mount; props are only the starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const last = state?.lastSyncAt ?? (lastSyncAt ? Date.parse(lastSyncAt) : null);
  const status = state?.status ?? (needsAction ? 'paused' : 'idle');
  const retry = state?.retryAt ?? null;
  const tone = status === 'ok' || status === 'idle' || status === 'syncing' ? 'text-positive' : status === 'rate_limited' ? 'text-caution' : 'text-negative';
  const stateText =
    status === 'rate_limited' && retry ? t('t212.live.state.rate_limited', { time: fmtTime(retry, locale) }) : t(`t212.live.state.${status}`) + (state?.errorCode && status === 'error' ? ` (${t(`t212.errors.${state.errorCode}`)})` : '');

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-line px-3 py-2 text-sm" data-testid="t212-live">
      <div>
        <div className="eyebrow">{t('t212.live.lastUpdate')}</div>
        <div className="tabular-nums">{last ? fmt(last, locale) : t('t212.live.never')}</div>
      </div>
      <div>
        <div className="eyebrow">{t('t212.live.nextUpdate')}</div>
        <div className="tabular-nums">{state?.nextAt ? fmt(state.nextAt, locale) : '—'}</div>
        <div className="muted text-xs">{t(`t212.live.mode.${state?.mode ?? 'active'}`)}</div>
      </div>
      <div aria-live="polite">
        <div className="eyebrow">{t('t212.live.connection')}</div>
        <div className={tone}>{stateText}</div>
        {rateLimit?.limit !== undefined && rateLimit.remaining !== undefined && (
          <div className="muted text-xs">{t('t212.live.rateLimit', { remaining: rateLimit.remaining, limit: rateLimit.limit })}</div>
        )}
      </div>
      <button type="button" className="btn-primary ml-auto" disabled={state?.inFlight} onClick={() => void pollerRef.current?.syncNow()}>
        {state?.inFlight ? '…' : `↻ ${t('t212.syncNow')}`}
      </button>
    </div>
  );
}
