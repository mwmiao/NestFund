import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACTIVE_POLL_MS,
  BACKGROUND_POLL_MS,
  T212Poller,
  pollInterval,
  pollMode,
  shouldSyncOnReturn,
  type PollResult,
} from '@/lib/t212-polling';
import { parseRateLimit, retryAtAfter } from '@/lib/t212-core';

const T0 = Date.parse('2026-11-04T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const ok = (at: number, extra: Partial<PollResult> = {}): PollResult => ({ ok: true, lastSyncAt: iso(at), retryAt: null, lastChangedAt: iso(T0), needsAction: false, ...extra });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

function make(init: Partial<ConstructorParameters<typeof T212Poller>[1]> = {}, sync?: (manual: boolean) => Promise<PollResult>) {
  const syncFn = vi.fn(sync ?? (async () => ok(Date.now())));
  const onChanged = vi.fn();
  const poller = new T212Poller({ sync: syncFn, onChanged }, { lastSyncAt: iso(T0), lastChangedAt: iso(T0), ...init });
  return { poller, syncFn, onChanged };
}

describe('adaptive interval', () => {
  it('polls every 60 s while visible and in use, every 6 h otherwise', () => {
    expect(pollInterval(pollMode(true, false))).toBe(60_000);
    expect(pollInterval(pollMode(false, false))).toBe(6 * 60 * 60 * 1000); // hidden tab / locked screen
    expect(pollInterval(pollMode(true, true))).toBe(BACKGROUND_POLL_MS); // idle device
    expect(ACTIVE_POLL_MS).toBe(60_000);
  });

  it('syncs every minute while active', async () => {
    const { poller, syncFn } = make();
    poller.start();
    expect(poller.state.nextAt).toBe(T0 + 60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(syncFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(syncFn).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it('drops to 6 hours in the background and does not poll every minute', async () => {
    const { poller, syncFn } = make();
    poller.start();
    poller.setVisible(false);
    expect(poller.state.mode).toBe('background');
    expect(poller.state.nextAt).toBe(T0 + BACKGROUND_POLL_MS);
    await vi.advanceTimersByTimeAsync(BACKGROUND_POLL_MS - 1000);
    expect(syncFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(syncFn).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('goes to the 6 h interval when the device becomes idle', () => {
    const { poller } = make();
    poller.start();
    poller.setIdle(true);
    expect(poller.state.mode).toBe('background');
    expect(poller.state.nextAt).toBe(T0 + BACKGROUND_POLL_MS);
    poller.stop();
  });
});

describe('tab visibility', () => {
  it('syncs immediately when the user returns and the last check is older than 60 s', async () => {
    const { poller, syncFn } = make();
    poller.start();
    poller.setVisible(false);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(syncFn).not.toHaveBeenCalled();
    poller.setVisible(true);
    expect(syncFn).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('does not sync on return when the last check is recent', async () => {
    const { poller, syncFn } = make();
    poller.start();
    poller.setVisible(false);
    await vi.advanceTimersByTimeAsync(30_000);
    poller.setVisible(true);
    expect(syncFn).not.toHaveBeenCalled();
    expect(poller.state.nextAt).toBe(T0 + 60_000); // back on the 60 s rhythm
    poller.stop();
  });

  it('syncs at start when the page opens with stale data', () => {
    const { poller, syncFn } = make({ lastSyncAt: iso(T0 - 5 * 60_000) });
    poller.start();
    expect(syncFn).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('shouldSyncOnReturn uses a 60 s threshold', () => {
    expect(shouldSyncOnReturn(T0, T0 + 59_999)).toBe(false);
    expect(shouldSyncOnReturn(T0, T0 + 60_000)).toBe(true);
    expect(shouldSyncOnReturn(null, T0)).toBe(true);
  });

  it('refreshes the page only when the values changed', async () => {
    let call = 0;
    const { poller, onChanged } = make({}, async () => ok(Date.now(), { lastChangedAt: iso(++call === 1 ? T0 : T0 + 1) }));
    poller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onChanged).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onChanged).toHaveBeenCalledTimes(1);
    poller.stop();
  });
});

describe('HTTP 429', () => {
  it('waits for x-ratelimit-reset instead of retrying immediately', async () => {
    const resetAt = T0 + 5 * 60_000;
    let first = true;
    const { poller, syncFn } = make({}, async () => {
      if (first) {
        first = false;
        return { ok: false, code: 'rate_limit', lastSyncAt: iso(T0), retryAt: iso(resetAt), lastChangedAt: iso(T0), needsAction: false };
      }
      return ok(Date.now());
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(60_000); // first poll → 429
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(poller.state.status).toBe('rate_limited');
    expect(poller.state.nextAt).toBe(resetAt);

    await vi.advanceTimersByTimeAsync(4 * 60_000 - 1000); // still before the reset
    expect(syncFn).toHaveBeenCalledTimes(1);
    // "Sync now" is also held back until the reset.
    const manual = await poller.syncNow();
    expect(manual).toMatchObject({ ok: false, code: 'rate_limit' });
    expect(syncFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(syncFn).toHaveBeenCalledTimes(2);
    expect(poller.state.status).toBe('ok');
    poller.stop();
  });

  it('parses the x-ratelimit-* headers and computes the retry time from the reset', () => {
    const headers = new Headers({ 'x-ratelimit-limit': '6', 'x-ratelimit-period': '60', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(Math.floor((T0 + 90_000) / 1000)), 'x-ratelimit-used': '6' });
    const rl = parseRateLimit(headers, T0)!;
    expect(rl).toMatchObject({ limit: 6, period: 60, remaining: 0, used: 6, resetAt: T0 + 90_000 });
    expect(retryAtAfter(rl, T0)).toBe(T0 + 90_000);
    expect(retryAtAfter(null, T0)).toBe(T0 + 60_000); // no header: conservative minute
    expect(retryAtAfter({ resetAt: T0 - 5000 }, T0)).toBe(T0 + 1000); // reset already passed
    expect(parseRateLimit(new Headers(), T0)).toBeNull();
  });
});

describe('duplicate requests', () => {
  it('shares one in-flight sync between "Sync now" clicks and timer ticks', async () => {
    let release!: (r: PollResult) => void;
    const { poller, syncFn } = make({}, () => new Promise<PollResult>((res) => (release = res)));
    poller.start();
    const a = poller.syncNow();
    const b = poller.syncNow();
    expect(syncFn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * 60_000); // timers do not start another one either
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(poller.state.inFlight).toBe(true);
    release(ok(Date.now()));
    await Promise.all([a, b]);
    expect(poller.state.inFlight).toBe(false);
    expect(syncFn).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('does not hammer the server after a failed attempt', async () => {
    const { poller, syncFn } = make({ lastSyncAt: iso(T0 - 10 * 60_000) }, async () => ({ ok: false, code: 'server', lastSyncAt: iso(T0 - 10 * 60_000), retryAt: null, lastChangedAt: null, needsAction: false }));
    poller.start(); // stale → immediate attempt, fails
    await vi.advanceTimersByTimeAsync(0);
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(poller.state.nextAt).toBe(T0 + 60_000);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(syncFn).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it('stops polling when the key needs attention', async () => {
    const { poller, syncFn } = make({}, async () => ({ ok: false, code: 'auth', lastSyncAt: iso(T0), retryAt: null, lastChangedAt: null, needsAction: true }));
    poller.start();
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(poller.state.status).toBe('paused');
    poller.stop();
  });
});
