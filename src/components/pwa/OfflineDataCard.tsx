'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/i18n/client';

type InstallEvent = Event & { prompt?: () => Promise<void> };

/** Settings card: install the app, see whether offline use is active, and delete everything stored for offline use. */
export function OfflineDataCard() {
  const { t } = useI18n();
  const [standalone, setStandalone] = useState(false);
  const [ios, setIos] = useState(false);
  const [workerActive, setWorkerActive] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setStandalone(window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true);
    // iPadOS reports itself as a Mac with a touch screen.
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    setWorkerActive(!!navigator.serviceWorker?.controller);
    const sync = () => setCanInstall(!!(window as Window & { __nestfundInstall?: InstallEvent }).__nestfundInstall);
    sync();
    window.addEventListener('nestfund-install-ready', sync);
    return () => window.removeEventListener('nestfund-install-ready', sync);
  }, []);

  const install = async () => {
    const e = (window as Window & { __nestfundInstall?: InstallEvent }).__nestfundInstall;
    await e?.prompt?.();
    (window as Window & { __nestfundInstall?: InstallEvent }).__nestfundInstall = undefined;
    setCanInstall(false);
  };

  const clear = async () => {
    if (!window.confirm(t('pwa.clearConfirm'))) return;
    const names = (await caches.keys()).filter((n) => n.startsWith('nestfund-'));
    await Promise.all(names.map((n) => caches.delete(n)));
    setMessage(t('pwa.cleared'));
  };

  return (
    <div className="space-y-3 text-sm">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2">
        <div>
          <dt className="eyebrow">{t('pwa.installedLabel')}</dt>
          <dd>{standalone ? t('pwa.yes') : t('pwa.no')}</dd>
        </div>
        <div>
          <dt className="eyebrow">{t('pwa.offlineLabel')}</dt>
          <dd>{workerActive ? t('pwa.active') : t('pwa.inactive')}</dd>
        </div>
      </dl>
      {canInstall && !standalone && (
        <button type="button" className="btn-primary" onClick={install}>
          {t('pwa.install')}
        </button>
      )}
      {ios && !standalone && <p className="rounded-control bg-raised px-3 py-2">{t('pwa.iosHint')}</p>}
      <p className="muted text-xs">{t('pwa.whatIsStored')}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={clear}>
          {t('pwa.clear')}
        </button>
        {message && (
          <span role="status" className="text-positive">
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
