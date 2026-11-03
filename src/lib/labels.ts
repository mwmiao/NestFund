import type { TFunction } from '@/i18n/config';
import type { AccountId, Category } from './types';

/** Built-in categories are translated through their key; custom (or renamed) ones show their stored name. */
export function categoryName(cat: Pick<Category, 'key' | 'name'> | undefined | null, t: TFunction): string {
  if (!cat) return t('tx.noCategory');
  return cat.key ? t(`categories.${cat.key}`) : cat.name;
}

export const accountName = (id: AccountId, t: TFunction) => t(`accounts.names.${id}`);
