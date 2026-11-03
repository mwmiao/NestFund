'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveTransactionAction } from '@/app/actions';
import { Field } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { accountName } from '@/lib/labels';
import { ACCOUNTS, ACCOUNT_IDS, PAYMENT_METHODS, RECURRENCES, TX_TYPES, type AccountId, type Transaction } from '@/lib/types';

export interface CategoryOption {
  id: number;
  key: string | null;
  label: string;
  color: string;
}

/** Account suggested when a category is picked, until the user chooses an account themself. */
const SUGGESTED_ACCOUNT: Record<string, AccountId> = {
  food: 'meal_card',
  restaurants: 'meal_card',
  gaming: 'revolut',
  collectibles: 'revolut',
  cosplay: 'revolut',
  leisure: 'revolut',
  clothing: 'revolut',
  travel: 'revolut',
  tech: 'revolut',
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full py-3 sm:w-auto sm:py-2" disabled={pending}>
      {pending ? '…' : label}
    </button>
  );
}

function AccountChips({ name, value, onChange, exclude }: { name: string; value: AccountId | ''; onChange: (a: AccountId) => void; exclude?: AccountId }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      <input type="hidden" name={name} value={value} />
      {ACCOUNT_IDS.filter((a) => a !== exclude).map((a) => {
        const active = a === value;
        const color = ACCOUNTS[a].color;
        return (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(a)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? 'text-white' : 'border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}
            style={active ? { background: color, borderColor: color } : undefined}
          >
            {accountName(a, t)}
          </button>
        );
      })}
    </div>
  );
}

export function TransactionForm({
  categories,
  transaction,
  today,
  back,
  merchants = [],
  subcategories = [],
  defaultAccount = 'ctt',
  initialType,
  error,
}: {
  categories: CategoryOption[];
  transaction?: Transaction | null;
  today: string;
  back: string;
  merchants?: string[];
  subcategories?: string[];
  defaultAccount?: AccountId;
  initialType?: string;
  error?: string | null;
}) {
  const { t } = useI18n();
  const [type, setType] = useState<string>(transaction?.type ?? (TX_TYPES.includes(initialType as never) ? (initialType as string) : 'purchase'));
  const [account, setAccount] = useState<AccountId>(transaction?.account ?? defaultAccount);
  const [toAccount, setToAccount] = useState<AccountId | ''>(transaction?.toAccount ?? '');
  const [accountTouched, setAccountTouched] = useState(!!transaction);
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false);
  const isTransfer = type === 'transfer';
  const hasDetails = !!(transaction && (transaction.subcategory || transaction.notes || transaction.attachment || transaction.recurring));

  return (
    <form action={saveTransactionAction} className="space-y-4">
      {transaction && <input type="hidden" name="id" value={transaction.id} />}
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="type" value={type} />

      {error === 'transfer' && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{t('tx.transferError')}</p>}

      <div className="-mx-1 flex gap-1 overflow-x-auto rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/60">
        {TX_TYPES.map((tp) => (
          <button
            key={tp}
            type="button"
            aria-pressed={type === tp}
            onClick={() => setType(tp)}
            className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium transition sm:text-sm ${
              type === tp ? 'bg-white shadow-sm dark:bg-zinc-900' : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {t(`tx.types.${tp}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label={`${t('common.amount')} (€)`}>
          <input
            name="amount"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            pattern="[0-9.,\s]*[0-9][0-9.,\s]*"
            defaultValue={transaction ? String(transaction.amount).replace('.', ',') : ''}
            className="input text-2xl font-semibold tabular-nums sm:text-xl"
            autoFocus={!transaction}
          />
        </Field>
        <Field label={t('common.date')}>
          <input type="date" name="date" required defaultValue={transaction?.date ?? today} className="input" />
        </Field>
      </div>

      <Field label={t('tx.description')}>
        <input name="description" required defaultValue={transaction?.description ?? ''} className="input" />
      </Field>

      <Field label={t('tx.category')}>
        <select
          name="categoryId"
          defaultValue={transaction?.categoryId ?? ''}
          className="input"
          onChange={(e) => {
            const key = categories.find((c) => String(c.id) === e.target.value)?.key;
            if (!accountTouched && !isTransfer && key && SUGGESTED_ACCOUNT[key]) setAccount(SUGGESTED_ACCOUNT[key]);
          }}
        >
          <option value="">{t('tx.noCategory')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <span className="label">{isTransfer ? t('tx.fromAccount') : t('tx.account')}</span>
        <AccountChips
          name="account"
          value={account}
          onChange={(a) => {
            setAccount(a);
            setAccountTouched(true);
            if (a === toAccount) setToAccount('');
          }}
        />
      </div>
      {isTransfer && (
        <div>
          <span className="label">{t('tx.toAccount')}</span>
          <AccountChips name="toAccount" value={toAccount} onChange={setToAccount} exclude={account} />
          <p className="muted mt-1 text-xs">{t('tx.transferNote')}</p>
        </div>
      )}

      <Field label={t('tx.merchant')}>
        <input name="merchant" list="merchants" defaultValue={transaction?.merchant ?? ''} className="input" />
        <datalist id="merchants">
          {merchants.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>

      <details open={hasDetails} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-zinc-800">
        <summary className="cursor-pointer select-none py-1 text-sm font-medium">{t('tx.moreDetails')}</summary>
        <div className="mt-3 space-y-4 pb-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('tx.paymentMethod')}>
              <select name="paymentMethod" defaultValue={transaction?.paymentMethod ?? (isTransfer ? 'transfer' : 'card')} key={isTransfer ? 'tr' : 'x'} className="input">
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`tx.methods.${m}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`${t('tx.subcategory')} (${t('common.optional')})`}>
              <input name="subcategory" list="subcategories" defaultValue={transaction?.subcategory ?? ''} className="input" />
              <datalist id="subcategories">
                {subcategories.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
          </div>

          <Field label={t('common.notes')}>
            <textarea name="notes" rows={2} defaultValue={transaction?.notes ?? ''} className="input" />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="label">
                {t('tx.attachment')} ({t('common.optional')})
              </span>
              <input
                type="file"
                name="attachment"
                accept="image/*,application/pdf"
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm dark:file:bg-zinc-800 dark:file:text-zinc-200"
              />
              {transaction?.attachment && (
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <a href={`/api/attachments/${encodeURIComponent(transaction.attachment)}`} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline">
                    {t('tx.attachmentCurrent')}
                  </a>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" name="removeAttachment" value="1" /> {t('tx.removeAttachment')}
                  </label>
                </div>
              )}
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="recurring" value="1" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
                {t('tx.recurring')}
              </label>
              {recurring && (
                <div className="mt-2">
                  <select name="recurrence" defaultValue={transaction?.recurrence ?? 'monthly'} className="input" aria-label={t('tx.recurrence')}>
                    {RECURRENCES.map((r) => (
                      <option key={r} value={r}>
                        {t(`tx.recurrences.${r}`)}
                      </option>
                    ))}
                  </select>
                  <p className="muted mt-1 text-xs">{t('tx.recurringHint')}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </details>

      <div className="sticky bottom-[4.5rem] -mx-4 flex flex-col-reverse gap-2 border-t border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <a href={back} className="btn-secondary">
          {t('common.cancel')}
        </a>
        <SubmitButton label={t('common.save')} />
      </div>
    </form>
  );
}
