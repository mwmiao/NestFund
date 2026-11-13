// Adaptive Trading 212 polling — pure logic (no React, no server imports), so it is unit-testable.
// The UI only decides *when* to ask the server to sync; the server still enforces its own limits.

import { ACTIVE_POLL_MS, BACKGROUND_POLL_MS, RESUME_MIN_AGE_MS, isoToMs, type PollResult } from './t212-policy';

export { ACTIVE_POLL_MS, BACKGROUND_POLL_MS, IDLE_AFTER_MS } from './t212-policy';
export type { PollResult } from './t212-policy';

export type PollMode = 'active' | 'background';

export function pollMode(visible: boolean, idle: boolean): PollMode {
  return visible && !idle ? 'active' : 'background';
}

export function pollInterval(mode: PollMode): number {
  return mode === 'active' ? ACTIVE_POLL_MS : BACKGROUND_POLL_MS;
}

/** Back in the foreground: sync right away only when the last check is older than 60 s. */
export function shouldSyncOnReturn(lastCheckedAt: number | null, now: number): boolean {
  return lastCheckedAt === null || now - lastCheckedAt >= RESUME_MIN_AGE_MS;
}

export type PollStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'rate_limited' | 'paused';

/** How one server answer is treated. Everything else (status, error code, retry anchor) derives from this. */
type Outcome = 'ok' | 'benign' | 'rate_limited' | 'error' | 'paused';

const BENIGN = new Set(['skipped', 'too_soon', 'in_progress']);
const STATUS_OF: Record<Outcome, PollStatus> = { ok: 'ok', benign: 'ok', rate_limited: 'rate_limited', error: 'error', paused: 'paused' };

function classify(r: PollResult): Outcome {
  if (r.needsAction) return 'paused';
  if (r.code === 'rate_limit') return 'rate_limited';
  if (r.ok) return 'ok';
  return r.code && BENIGN.has(r.code) ? 'benign' : 'error';
}

export interface PollerState {
  mode: PollMode;
  status: PollStatus;
  errorCode: string | null;
  lastSyncAt: number | null;
  lastChangedAt: number | null;
  retryAt: number | null;
  /** When the next automatic attempt is planned (epoch ms); null when paused. */
  nextAt: number | null;
  inFlight: boolean;
}

export interface PollerDeps {
  sync: (manual: boolean) => Promise<PollResult>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  onState?: (s: PollerState) => void;
  /** Called when the stored values changed (so the page can refresh its data). */
  onChanged?: () => void;
}

/** Starting point from the server-rendered page (ISO strings, as stored). */
export interface PollerInit {
  lastSyncAt: string | null;
  lastChangedAt?: string | null;
  retryAt?: string | null;
  needsAction?: boolean;
  visible?: boolean;
  idle?: boolean;
}

export class T212Poller {
  private deps: Required<Pick<PollerDeps, 'sync' | 'now' | 'setTimer' | 'clearTimer'>> & PollerDeps;
  private timer: unknown = null;
  private inFlight: Promise<PollResult> | null = null;
  private running = false;
  private visible: boolean;
  private idle: boolean;
  private paused: boolean;
  private lastFailedAt: number | null = null; // a failed attempt must not retrigger immediately
  private s: PollerState;

  constructor(deps: PollerDeps, init: PollerInit) {
    this.deps = {
      now: () => Date.now(),
      setTimer: (fn, delay) => setTimeout(fn, delay),
      clearTimer: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
      ...deps,
    };
    this.visible = init.visible ?? true;
    this.idle = init.idle ?? false;
    this.paused = !!init.needsAction;
    this.s = {
      mode: pollMode(this.visible, this.idle),
      status: this.paused ? 'paused' : 'idle',
      errorCode: null,
      lastSyncAt: isoToMs(init.lastSyncAt),
      lastChangedAt: isoToMs(init.lastChangedAt),
      retryAt: isoToMs(init.retryAt),
      nextAt: null,
      inFlight: false,
    };
  }

  get state(): PollerState {
    return this.s;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (this.s.mode === 'active' && shouldSyncOnReturn(this.s.lastSyncAt, this.deps.now())) void this.run(false);
    else this.schedule();
  }

  stop() {
    this.running = false;
    this.clear();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.modeChanged();
  }

  setIdle(idle: boolean) {
    if (idle === this.idle) return;
    this.idle = idle;
    this.modeChanged();
  }

  /** "Sync now". Shares the in-flight request instead of starting another one. */
  syncNow(): Promise<PollResult> {
    return this.run(true);
  }

  private modeChanged() {
    const mode = pollMode(this.visible, this.idle);
    const wasBackground = this.s.mode === 'background';
    this.emit({ mode });
    if (!this.running) return;
    if (mode === 'active' && wasBackground && !this.paused && shouldSyncOnReturn(this.s.lastSyncAt, this.deps.now())) void this.run(false);
    else this.schedule();
  }

  private run(manual: boolean): Promise<PollResult> {
    if (this.inFlight) return this.inFlight; // never two requests at once
    const now = this.deps.now();
    if (this.s.retryAt !== null && now < this.s.retryAt) {
      // Rate limited: wait for the reset time instead of asking again.
      this.schedule();
      const { lastSyncAt, retryAt, lastChangedAt } = this.s;
      return Promise.resolve({ ok: false, code: 'rate_limit', lastSyncAt, retryAt, lastChangedAt, needsAction: false });
    }
    this.clear();
    this.emit({ status: 'syncing', inFlight: true, nextAt: null });
    const p = this.deps
      .sync(manual)
      .catch((): PollResult => ({ ok: false, code: 'network', lastSyncAt: null, retryAt: null, lastChangedAt: null, needsAction: false }))
      .then((r) => {
        this.apply(r);
        return r;
      })
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = p;
    return p;
  }

  private apply(r: PollResult) {
    const now = this.deps.now();
    const outcome = classify(r);
    const failed = outcome === 'error' || outcome === 'paused' || outcome === 'rate_limited';
    this.paused = outcome === 'paused';
    this.lastFailedAt = outcome === 'error' || outcome === 'paused' ? now : null;
    const changed = r.lastChangedAt !== null && r.lastChangedAt !== this.s.lastChangedAt;
    this.emit({
      inFlight: false,
      lastSyncAt: r.lastSyncAt ?? this.s.lastSyncAt,
      lastChangedAt: r.lastChangedAt ?? this.s.lastChangedAt,
      retryAt: r.retryAt !== null && r.retryAt > now ? r.retryAt : null,
      errorCode: failed ? (r.code ?? 'network') : null,
      status: STATUS_OF[outcome],
    });
    if (changed) this.deps.onChanged?.();
    if (this.running) this.schedule();
  }

  private schedule() {
    this.clear();
    if (!this.running || this.paused) {
      this.emit({ nextAt: null });
      return;
    }
    const now = this.deps.now();
    // Count from the latest attempt (success or failure); with none yet, from now.
    const anchor = Math.max(this.s.lastSyncAt ?? 0, this.lastFailedAt ?? 0) || now;
    // Always wait at least until the rate-limit reset; an overdue run fires right away.
    const at = Math.max(anchor + pollInterval(this.s.mode), this.s.retryAt ?? 0, now);
    this.emit({ nextAt: at });
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void this.run(false);
    }, at - now);
  }

  private clear() {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  private emit(patch: Partial<PollerState>) {
    this.s = { ...this.s, ...patch };
    this.deps.onState?.(this.s);
  }
}
