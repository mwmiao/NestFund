import type { TFunction } from '@/i18n/config';
import type { AccountId, Category } from './types';

/** Built-in categories are translated through their key; custom (or renamed) ones show their stored name. */
export function categoryName(cat: Pick<Category, 'key' | 'name'> | undefined | null, t: TFunction): string {
  if (!cat) return t('tx.noCategory');
  return cat.key ? t(`categories.${cat.key}`) : cat.name;
}

/** A new array of categories ordered by their displayed name; the input (often a shared cached list) is left untouched. */
export function sortedByName<C extends Pick<Category, 'key' | 'name'>>(cats: readonly C[], t: TFunction): C[] {
  return cats.map((c) => ({ c, label: categoryName(c, t) })).sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })).map((x) => x.c);
}

export const accountName = (id: AccountId, t: TFunction) => t(`accounts.names.${id}`);
