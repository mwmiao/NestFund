'use client';

import { useState } from 'react';
import { setupFixedAction } from '@/app/actions';
import { useI18n } from '@/i18n/client';
import { accountName } from '@/lib/labels';
import { ACCOUNT_IDS } from '@/lib/types';

/** Editable list of fixed monthly costs; empty rows are ignored on save. */
export function FixedExpensesForm({ categories, skipHref }: { categories: { id: number; label: string }[]; skipHref: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState([0, 1, 2]);
  return (
    <form action={setupFixedAction} className="space-y-3">
      {rows.map((key, i) => (
        <div key={key} className="grid grid-cols-[1fr_6.5rem] gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-[1.5fr_7rem_1fr_1fr]">
          <input name="name" placeholder={t('setup.fixedNamePlaceholder')} aria-label={`${t('common.name')} ${i + 1}`} className="input" />
          <input name="amount" inputMode="decimal" placeholder="0,00 €" aria-label={`${t('common.amount')} ${i + 1}`} className="input tabular-nums" />
          <select name="categoryId" defaultValue="" aria-label={t('tx.category')} className="input">
            <option value="">{t('tx.noCategory')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select name="account" defaultValue="ctt" aria-label={t('tx.account')} className="input">
            {ACCOUNT_IDS.map((a) => (
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
        <button className="btn-primary">{t('setup.saveContinue')}</button>
      </div>
    </form>
  );
}
