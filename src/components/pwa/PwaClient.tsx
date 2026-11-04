'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/i18n/client';

type InstallPromptWindow = Window & { __nestfundInstall?: Event & { prompt?: () => Promise<void> } };

/**
 * Registers the service worker (production only) and shows two small notices:
 * "you are offline" and "a new version is ready". It never reloads the page by itself: an update is applied only when
 * the user taps the button, so nothing typed in a form is lost.
 */
export function PwaClient() {
  const { t } = useI18n();
  const [online, setOnline] = useState(true);
  // Set by the service worker when it answers with a saved page because the server could not be reached.
  const [savedCopy, setSavedCopy] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    setSavedCopy(!!document.querySelector('meta[name="nestfund-offline-copy"]'));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    // Keep the "install" prompt (Android / desktop) so the Settings page can offer it with a button.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      (window as InstallPromptWindow).__nestfundInstall = e;
      window.dispatchEvent(new Event('nestfund-install-ready'));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('beforeinstallprompt', onPrompt);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    let registration: ServiceWorkerRegistration | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const onControllerChange = () => {
      // The first install also fires this event; only reload when the user asked for an update.
      if (updateRequested.current) window.location.reload();
    };
    const watch = (worker: ServiceWorker | null) => {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) setWaiting(worker);
      });
    };
    const checkForUpdate = () => registration?.update().catch(() => undefined);
    const onVisible = () => document.visibilityState === 'visible' && checkForUpdate();

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener('updatefound', () => watch(reg.installing));
        // A new image from Watchtower is noticed within the hour while the app is open, and on every return to it.
        timer = setInterval(checkForUpdate, 60 * 60 * 1000);
        document.addEventListener('visibilitychange', onVisible);
      })
      .catch(() => undefined); // the app works the same without a worker

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, []);

  if (online && !savedCopy && !waiting) return null;
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[4.25rem] z-50 space-y-2 lg:left-64 lg:top-4">
      {(!online || savedCopy) && (
        <p role="status" className="pointer-events-auto rounded-control border border-caution/30 bg-surface px-4 py-3 text-sm shadow-pop">
          {t('pwa.offline')}
        </p>
      )}
      {waiting && (
        <div role="status" className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-control border border-brand-500/40 bg-surface px-4 py-3 text-sm shadow-pop">
          <span className="min-w-0 flex-1">{t('pwa.updateReady')}</span>
          <button
            type="button"
            className="btn-primary !px-4 !py-2"
            onClick={() => {
              updateRequested.current = true;
              waiting.postMessage({ type: 'SKIP_WAITING' });
            }}
          >
            {t('pwa.update')}
          </button>
        </div>
      )}
    </div>
  );
}
