import { syncT212 } from './t212';

const CHECK_EVERY_MS = 15 * 60 * 1000;
const globalForScheduler = globalThis as unknown as { __nestfundT212Timer?: NodeJS.Timeout };

/**
 * Background sync: checks every 15 minutes and syncs once the last success is 6 hours old
 * (so it catches up after the NAS sleeps or the container restarts). Errors never crash the app.
 */
export function startT212Scheduler() {
  if (globalForScheduler.__nestfundT212Timer) return;
  const tick = () => {
    syncT212().catch((err) => console.error('[trading212] background sync failed:', err));
  };
  setTimeout(tick, 30_000).unref();
  globalForScheduler.__nestfundT212Timer = setInterval(tick, CHECK_EVERY_MS);
  globalForScheduler.__nestfundT212Timer.unref();
}
