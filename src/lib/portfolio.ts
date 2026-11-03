import 'server-only';
import type { AccountBalance } from './calc';
import type { T212Status } from './t212';

export interface EtfSummary {
  value: number; // total account value
  invested: number; // capital in positions (cost basis)
  gain: number; // unrealised profit/loss
  growthPct: number; // gain ÷ invested
  cash: number; // uninvested cash in the account
  source: 'api' | 'manual' | 'none';
  asOf: string | null; // ISO date-time (API) or YYYY-MM-DD (manual check-in)
  currency: string;
}

/**
 * One definition of the Trading 212 figures for every screen. With the API connected the numbers
 * match the Trading 212 app (cost basis, unrealised P/L); otherwise they come from manual check-ins.
 */
export function etfSummary(balance: AccountBalance, t212: T212Status): EtfSummary {
  // Prefer the API only when its last sync is at least as recent as the latest balance in use.
  const syncDate = t212.lastSyncAt?.slice(0, 10) ?? null;
  if (t212.metrics && syncDate && (!balance.since || syncDate >= balance.since)) {
    const m = t212.metrics;
    return { value: m.totalValue, invested: m.invested, gain: m.unrealized, growthPct: m.growthPct, cash: m.cash, source: 'api', asOf: t212.lastSyncAt, currency: m.currency };
  }
  const gain = balance.balance - balance.invested;
  return {
    value: balance.balance,
    invested: balance.invested,
    gain,
    growthPct: balance.invested > 0 ? gain / balance.invested : 0,
    cash: 0,
    source: balance.since ? 'manual' : 'none',
    asOf: balance.since,
    currency: 'EUR',
  };
}
