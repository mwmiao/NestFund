'use client';

import { useState } from 'react';
import { setupFixedAction } from '@/app/actions';
import { useAccounts } from '@/components/AccountsProvider';
import { useI18n } from '@/i18n/client';
import { accountName } from '@/lib/labels';
import { SubmitButton } from '@/components/SubmitButton';
import { AmountInput } from '@/components/AmountInput';

/** Editable list of fixed monthly costs; empty rows are ignored on save. */
export function FixedExpensesForm({ categories, skipHref }: { categories: { id: number; label: string }[]; skipHref: string }) {
  const { t } = useI18n();
  const accounts = useAccounts();
  const [rows, setRows] = useState([0, 1, 2]);
  return (
    <form action={setupFixedAction} className="space-y-3">
      {rows.map((key, i) => (
        <div key={key} className="grid grid-cols-[1fr_6.5rem] gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1.5fr_7rem_1fr_1fr]">
          <input name="name" placeholder={t('setup.fixedNamePlaceholder')} aria-label={`${t('common.name')} ${i + 1}`} className="input" />
          <AmountInput name="amount" placeholder="0,00 €" aria-label={`${t('common.amount')} ${i + 1}`} className="input tabular-nums" />
          <select name="categoryId" defaultValue="" aria-label={t('tx.category')} className="input">
            <option value="">{t('tx.noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select name="account" defaultValue={accounts.includes('ctt') ? 'ctt' : accounts[0]} aria-label={t('tx.account')} className="input">
            {accounts.map((a) => (
              <option key={a} value={a}>
                {accountName(a, t)}
              </option>
            ))}
          </select>
        </div>
      ))}
      <button type="button" className="btn-ghost text-sm" onClick={() => setRows((r) => [...r, Math.max(...r) + 1])}>
        + {t('setup.addRow')}
      </button>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <a href={skipHref} className="btn-secondary">
          {t('setup.skip')}
        </a>
        <SubmitButton className="btn-primary">{t('setup.saveContinue')}</SubmitButton>
      </div>
    </form>
  );
}
