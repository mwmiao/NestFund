// Adaptive Trading 212 polling — pure logic (no React, no server imports), so it is unit-testable.
// The UI only decides *when* to ask the server to sync; the server still enforces its own limits.

export const ACTIVE_POLL_MS = 60_000; // dashboard / portfolio open and in use
export const BACKGROUND_POLL_MS = 6 * 60 * 60 * 1000; // hidden tab, locked or idle device
export const RESUME_MIN_AGE_MS = 60_000; // sync on return only if the last check is older than this
export const IDLE_AFTER_MS = 10 * 60 * 1000; // no input for this long = idle device
/** The server accepts a poll slightly early so small clock differences never cause a skipped round. */
export const SERVER_POLL_MIN_AGE_MS = 50_000;

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

/** What the server reports after a poll (see pollT212Action). */
export interface PollResult {
  ok: boolean;
  /** Error or benign skip code ('skipped', 'too_soon', 'in_progress' are not failures). */
  code?: string;
  /** Last successful check (ISO). */
  lastSyncAt: string | null;
  /** Do not call again before this (ISO) — set after a 429. */
  retryAt: string | null;
  /** Last time the values actually changed (ISO). */
  lastChangedAt: string | null;
  /** Needs the user (invalid key, no permission): stop polling. */
  needsAction: boolean;
}

export type PollStatus = 'idle' | 'syncing' | 'ok' | 'error' | 'rate_limited' | 'paused';

export interface PollerState {
  mode: PollMode;
  status: PollStatus;
  errorCode: string | null;
  lastSyncAt: number | null;
  lastChangedAt: string | null;
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

export interface PollerInit {
  lastSyncAt: string | null;
  lastChangedAt?: string | null;
  retryAt?: string | null;
  needsAction?: boolean;
  visible?: boolean;
  idle?: boolean;
}

const BENIGN = new Set(['skipped', 'too_soon', 'in_progress']);
const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) || null : null);

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
      lastSyncAt: ms(init.lastSyncAt),
      lastChangedAt: init.lastChangedAt ?? null,
      retryAt: ms(init.retryAt),
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
      return Promise.resolve(this.localResult('rate_limit'));
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

  private localResult(code: string): PollResult {
    return {
      ok: false,
      code,
      lastSyncAt: this.s.lastSyncAt === null ? null : new Date(this.s.lastSyncAt).toISOString(),
      retryAt: this.s.retryAt === null ? null : new Date(this.s.retryAt).toISOString(),
      lastChangedAt: this.s.lastChangedAt,
      needsAction: false,
    };
  }

  private apply(r: PollResult) {
    const lastSyncAt = ms(r.lastSyncAt) ?? this.s.lastSyncAt;
    const retryAt = ms(r.retryAt);
    const changed = r.lastChangedAt !== null && r.lastChangedAt !== this.s.lastChangedAt;
    this.paused = r.needsAction;
    this.lastFailedAt = !r.ok && !(r.code && BENIGN.has(r.code)) && r.code !== 'rate_limit' ? this.deps.now() : null;
    const failed = !r.ok && !(r.code && BENIGN.has(r.code));
    this.emit({
      inFlight: false,
      lastSyncAt,
      lastChangedAt: r.lastChangedAt ?? this.s.lastChangedAt,
      retryAt: retryAt !== null && retryAt > this.deps.now() ? retryAt : null,
      errorCode: failed ? (r.code ?? 'network') : null,
      status: r.needsAction ? 'paused' : r.code === 'rate_limit' ? 'rate_limited' : failed ? 'error' : 'ok',
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
    const mode = this.s.mode;
    const base = Math.max(this.s.lastSyncAt ?? 0, this.lastFailedAt ?? 0, this.s.lastSyncAt === null && this.lastFailedAt === null ? now : 0) + pollInterval(mode);
    // Always wait at least until the rate-limit reset; an overdue run fires right away.
    const at = Math.max(base, this.s.retryAt ?? 0, now);
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
