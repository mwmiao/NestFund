// Small, dependency-free security helpers. Pure and edge-safe (no Node-only imports), so the middleware,
// server actions and route handlers share the same code and the tests cover it.

/** Largest amount (in euros) accepted from any form or file. Keeps cents safely inside JavaScript's integer range. */
export const MAX_AMOUNT = 1_000_000_000;

export const MAX_TEXT = { name: 100, description: 200, merchant: 120, subcategory: 80, notes: 2000, ruleText: 80 } as const;

/** Trims and caps free text so one request cannot store megabytes in a single field. */
export function clampText(value: string, max: number): string {
  return value.trim().slice(0, max);
}

/**
 * A redirect target that stays inside the app. Rejects absolute URLs, protocol-relative ones ("//evil.com"),
 * backslash tricks ("/\evil.com", which browsers read as "//evil.com") and control characters.
 */
export function safeLocalPath(value: string, fallback: string): string {
  if (!value || value.length > 500) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

/**
 * Spreadsheet formula injection: a cell starting with = + - @ (or a tab/CR) is run as a formula by Excel and LibreOffice.
 * Prefixing an apostrophe makes it plain text. Used for every CSV the app writes.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+@\t\r-]/.test(value) ? `'${value}` : value;
}

/** Compares two strings in time that does not depend on where they first differ (works in the Edge runtime). */
export function constantTimeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Decodes the credentials of an `Authorization: Basic …` header; null when missing or malformed (never throws). */
export function parseBasicAuth(header: string | null | undefined): { user: string; pass: string } | null {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6).trim()), (c) => c.charCodeAt(0)));
    const i = decoded.indexOf(':');
    return i < 0 ? null : { user: decoded.slice(0, i), pass: decoded.slice(i + 1) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- rate limiting

export interface RateResult {
  ok: boolean;
  /** Seconds until another attempt is allowed (0 when ok). */
  retryAfter: number;
}

/**
 * Fixed-window counter kept in memory: enough to slow down guessing and accidental loops on a single self-hosted
 * instance. It resets when the server restarts and is per process, which is the intended scope here.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}

  /** Counts one attempt for `key`. */
  hit(key: string, now = Date.now()): RateResult {
    this.prune(now);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return { ok: true, retryAfter: 0 };
    }
    entry.count += 1;
    return entry.count <= this.max ? { ok: true, retryAfter: 0 } : { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  /** Whether `key` is currently blocked, without counting an attempt. */
  blocked(key: string, now = Date.now()): RateResult {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now || entry.count <= this.max) return { ok: true, retryAfter: 0 };
    return { ok: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private prune(now: number) {
    if (this.hits.size < 500) return;
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}

const limiters = ((globalThis as { __nestfundLimiters?: Map<string, RateLimiter> }).__nestfundLimiters ??= new Map());

/** One shared limiter per name (survives hot reloads and is shared by every importer of this module). */
export function limiter(name: string, max: number, windowMs: number): RateLimiter {
  let l = limiters.get(name);
  if (!l) limiters.set(name, (l = new RateLimiter(max, windowMs)));
  return l;
}

/** Best-effort client identity behind a reverse proxy / Cloudflare Tunnel. Only used to tell clients apart for throttling. */
export function clientKey(headers: { get(name: string): string | null }): string {
  const raw = headers.get('cf-connecting-ip') || headers.get('x-forwarded-for')?.split(',')[0] || headers.get('x-real-ip') || 'local';
  return raw.trim().slice(0, 64) || 'local';
}

// ---------------------------------------------------------------- logging

/**
 * Turns an unknown error into a short, safe log line: the error type and a redacted, truncated message.
 * Never prints stacks or request/response bodies, and masks anything that looks like a key, token or Authorization value.
 */
export function describeError(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  const message = err instanceof Error ? err.message : String(err);
  return `${name}: ${redact(message)}`.slice(0, 300);
}

export function redact(text: string): string {
  return text
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9+/=._-]{8,}/gi, '$1 [redacted]')
    .replace(/(authorization|api[-_ ]?key|api[-_ ]?secret|secret|token|password)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}\b/g, '[redacted]');
}
