'use client';

import { createContext, useContext } from 'react';
import { ACCOUNT_IDS, type AccountId } from '@/lib/types';

const AccountsContext = createContext<readonly AccountId[] | null>(null);

/** Makes the accounts that are not hidden in Settings available to every client component. */
export function AccountsProvider({ visible, children }: { visible: readonly AccountId[]; children: React.ReactNode }) {
  return <AccountsContext.Provider value={visible}>{children}</AccountsContext.Provider>;
}

/**
 * Accounts to offer in a picker, in the standard order. Pass the accounts an existing record already uses
 * so editing it never loses a value that was hidden afterwards.
 */
export function useAccounts(keep: readonly AccountId[] = []): AccountId[] {
  const visible = useContext(AccountsContext);
  if (!visible) throw new Error('useAccounts must be used inside <AccountsProvider>');
  return ACCOUNT_IDS.filter((a) => visible.includes(a) || keep.includes(a));
}
