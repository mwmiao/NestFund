// Trading 212 sync policy shared by the server (t212.ts, scheduler) and the browser poller (t212-polling.ts).
// Pure: no React, no server-only imports. Every timing decision lives here so both sides cannot drift apart.

/** Background cadence: the server scheduler and a hidden / idle browser tab both sync this often. */
export const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const ACTIVE_POLL_MS = 60_000; // dashboard / portfolio open and in use
export const BACKGROUND_POLL_MS = SYNC_INTERVAL_MS;
export const RESUME_MIN_AGE_MS = 60_000; // sync on return only if the last check is older than this
export const IDLE_AFTER_MS = 10 * 60 * 1000; // no input for this long = idle device
/** The server accepts a poll slightly early so small clock differences never cause a skipped round. */
export const SERVER_POLL_MIN_AGE_MS = 50_000;

/** ISO string → epoch ms; null for missing or unparsable values. */
export const isoToMs = (iso: string | null | undefined): number | null => (iso ? Date.parse(iso) || null : null);

/** What the server reports after a poll (see pollT212Action). All times are epoch ms. */
export interface PollResult {
  ok: boolean;
  /** Error or benign skip code ('skipped', 'too_soon', 'in_progress' are not failures). */
  code?: string;
  /** Last successful check. */
  lastSyncAt: number | null;
  /** Do not call again before this — set after a 429. */
  retryAt: number | null;
  /** Last time the values actually changed. */
  lastChangedAt: number | null;
  /** Needs the user (invalid key, no permission): stop polling. */
  needsAction: boolean;
}
