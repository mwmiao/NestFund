import { isISODate } from './dates';
import { TX_TYPES } from './types';

/**
 * Where "Save + new" goes: the new-transaction form again, keeping the kind and the date.
 * `nonce` only has to differ from the previous one; the page uses it as a React key so the form starts empty.
 */
export function addAnotherUrl(kept: { type: string; date: string }, nonce: number | string): string {
  const qs = new URLSearchParams({ saved: '1', type: kept.type, date: kept.date, n: String(nonce) });
  return `/transactions/new?${qs}`;
}

/** Reads those parameters back, ignoring anything that is not one of ours. */
export function parseAgainParams(sp: { saved?: string; type?: string; date?: string; n?: string }): { saved: boolean; type?: string; date?: string; formKey: string } {
  return {
    saved: sp.saved === '1',
    type: TX_TYPES.includes(sp.type as never) ? sp.type : undefined,
    date: isISODate(sp.date) ? sp.date : undefined,
    formKey: /^\d{1,20}$/.test(sp.n ?? '') ? (sp.n as string) : 'new',
  };
}
