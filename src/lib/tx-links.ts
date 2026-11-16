import { safeLocalPath } from './security';

/** Link to a transaction's edit page that remembers the page it is opened from (a local path with its query). */
export function txEditHref(id: number, from?: string): string {
  return from ? `/transactions/${id}?from=${encodeURIComponent(from)}` : `/transactions/${id}`;
}

/** Where the edit page returns to: the page it was opened from when that is a safe local path, otherwise the transaction's month. */
export function txBackTarget(from: string | undefined, date: string): string {
  return safeLocalPath(from ?? '', `/transactions?month=${date.slice(0, 7)}`);
}
