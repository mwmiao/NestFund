import { isMonth } from './dates';
import type { TxFilters } from './repo';

/** Shared by the transactions page and the CSV export so both apply identical filters. */
export function parseTxFilters(sp: Record<string, string | string[] | undefined>): TxFilters {
  const get = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
  };
  const month = get('month');
  const year = get('year');
  const cat = Number(get('category'));
  return {
    month: isMonth(month) ? month : undefined,
    year: year && /^\d{4}$/.test(year) ? year : undefined,
    categoryId: Number.isInteger(cat) && cat > 0 ? cat : undefined,
    account: get('account'),
    paymentMethod: get('method'),
    type: get('type'),
    q: get('q'),
  };
}
