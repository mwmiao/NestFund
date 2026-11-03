// Trading 212 Public API — read-only client core (no storage, no Next.js imports; unit-testable).
// Docs: https://docs.trading212.com/api

export const T212_BASE_URLS = {
  live: 'https://live.trading212.com/api/v0',
  demo: 'https://demo.trading212.com/api/v0',
} as const;
export type T212Env = keyof typeof T212_BASE_URLS;

/**
 * The only endpoints NestFund may call. All are GET-only account/portfolio reads:
 * there is deliberately no way to reach order, buy or sell endpoints from this client.
 */
export const T212_READ_ONLY_PATHS = ['/equity/account/summary', '/equity/positions', '/equity/portfolio'] as const;
export type T212Path = (typeof T212_READ_ONLY_PATHS)[number];

export type T212ErrorCode = 'auth' | 'forbidden' | 'rate_limit' | 'not_found' | 'network' | 'server' | 'invalid_response' | 'blocked';

export class T212Error extends Error {
  constructor(
    public code: T212ErrorCode,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'T212Error';
  }
}

export interface T212Credentials {
  env: T212Env;
  apiKey: string;
  /** API secret for keys created since 2025 (HTTP Basic). Empty for legacy single keys. */
  apiSecret?: string;
}

export function authorizationHeader({ apiKey, apiSecret }: T212Credentials): string {
  return apiSecret ? `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}` : apiKey;
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export async function t212Get<T>(path: T212Path, creds: T212Credentials, fetchImpl: FetchLike = fetch): Promise<T> {
  if (!T212_READ_ONLY_PATHS.includes(path)) throw new T212Error('blocked', `Path not allowed: ${path}`);
  const base = T212_BASE_URLS[creds.env];
  if (!base) throw new T212Error('blocked', 'Unknown environment');

  let res: Response;
  try {
    res = await fetchImpl(base + path, {
      method: 'GET',
      headers: { Authorization: authorizationHeader(creds), Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch (err) {
    throw new T212Error('network', err instanceof Error ? err.message : 'Network error');
  }

  if (res.status === 401) throw new T212Error('auth', 'Invalid API key or secret', 401);
  if (res.status === 403) throw new T212Error('forbidden', 'The API key lacks the required read permission', 403);
  if (res.status === 404) throw new T212Error('not_found', 'Endpoint not found', 404);
  if (res.status === 429) throw new T212Error('rate_limit', 'Rate limit reached', 429);
  if (!res.ok) throw new T212Error('server', `Trading 212 responded with HTTP ${res.status}`, res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new T212Error('invalid_response', 'Response was not valid JSON', res.status);
  }
}

// ---------------------------------------------------------------------------- mapping

export interface T212Metrics {
  currency: string;
  totalValue: number; // cash + investments
  cash: number; // free cash (available + in pies + reserved)
  invested: number; // capital invested in positions (cost basis)
  unrealized: number; // unrealised profit/loss of open positions
  growthPct: number; // unrealized ÷ invested
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Maps GET /equity/account/summary. Throws on a response that lacks the expected numbers. */
export function metricsFromSummary(raw: unknown): T212Metrics {
  const s = (raw ?? {}) as { currency?: string; totalValue?: unknown; cash?: Record<string, unknown>; investments?: Record<string, unknown> };
  const totalValue = num(s.totalValue);
  const invested = num(s.investments?.totalCost);
  const unrealized = num(s.investments?.unrealizedProfitLoss);
  if (![totalValue, invested, unrealized].every(Number.isFinite)) throw new T212Error('invalid_response', 'Unexpected account summary format');
  const cash = ['availableToTrade', 'inPies', 'reservedForOrders'].reduce((sum, k) => sum + (Number.isFinite(num(s.cash?.[k])) ? num(s.cash?.[k]) : 0), 0);
  return {
    currency: typeof s.currency === 'string' ? s.currency : 'EUR',
    totalValue: r2(totalValue),
    cash: r2(cash),
    invested: r2(invested),
    unrealized: r2(unrealized),
    growthPct: invested > 0 ? unrealized / invested : 0,
  };
}

export interface T212Position {
  ticker: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  value: number;
  unrealized: number;
}

/** Maps GET /equity/positions (current API) and the legacy GET /equity/portfolio shape. */
export function mapPositions(raw: unknown): T212Position[] {
  if (!Array.isArray(raw)) throw new T212Error('invalid_response', 'Unexpected positions format');
  return raw
    .map((p: Record<string, any>) => {
      const quantity = num(p.quantity);
      const currentPrice = num(p.currentPrice);
      if (p.instrument || p.walletImpact) {
        return {
          ticker: String(p.instrument?.ticker ?? ''),
          name: String(p.instrument?.name ?? p.instrument?.ticker ?? ''),
          quantity,
          averagePrice: num(p.averagePricePaid),
          currentPrice,
          value: num(p.walletImpact?.currentValue),
          unrealized: num(p.walletImpact?.unrealizedProfitLoss),
        };
      }
      return {
        ticker: String(p.ticker ?? ''),
        name: String(p.ticker ?? ''),
        quantity,
        averagePrice: num(p.averagePrice),
        currentPrice,
        value: quantity * currentPrice,
        unrealized: num(p.ppl),
      };
    })
    .filter((p) => p.ticker && Number.isFinite(p.quantity))
    .map((p) => ({ ...p, value: Number.isFinite(p.value) ? r2(p.value) : 0, unrealized: Number.isFinite(p.unrealized) ? r2(p.unrealized) : 0 }))
    .sort((a, b) => b.value - a.value);
}

export interface T212Snapshot {
  metrics: T212Metrics;
  positions: T212Position[] | null;
  /** Set when the summary worked but positions could not be read (e.g. missing permission). */
  positionsError: T212ErrorCode | null;
}

/** One read-only sync: account summary (required) + positions (optional). */
export async function fetchT212(creds: T212Credentials, fetchImpl: FetchLike = fetch): Promise<T212Snapshot> {
  const metrics = metricsFromSummary(await t212Get('/equity/account/summary', creds, fetchImpl));
  try {
    let raw: unknown;
    try {
      raw = await t212Get('/equity/positions', creds, fetchImpl);
    } catch (err) {
      if (!(err instanceof T212Error && err.code === 'not_found')) throw err;
      raw = await t212Get('/equity/portfolio', creds, fetchImpl); // older API versions
    }
    return { metrics, positions: mapPositions(raw), positionsError: null };
  } catch (err) {
    return { metrics, positions: null, positionsError: err instanceof T212Error ? err.code : 'network' };
  }
}
