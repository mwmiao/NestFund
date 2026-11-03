'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveTransactionAction } from '@/app/actions';
import { Field, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { accountName } from '@/lib/labels';
import { ACCOUNTS, ACCOUNT_IDS, PAYMENT_METHODS, RECURRENCES, TX_TYPES, isSpending, type AccountId, type Transaction, type TxType } from '@/lib/types';

type Kind = 'spending' | 'income' | 'transfer';
const KINDS: Kind[] = ['spending', 'income', 'transfer'];
const SPEND_TYPES: TxType[] = ['purchase', 'expense', 'payment'];
const kindOf = (type: TxType): Kind => (type === 'income' || type === 'transfer' ? type : 'spending');

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
    <button type="submit" className="btn-primary flex-1 sm:flex-none" disabled={pending}>
      {pending ? <Spinner /> : label}
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
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? 'text-white' : 'border-line text-subtle hover:text-ink'}`}
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
  topCategoryIds = [],
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
  topCategoryIds?: number[];
  error?: string | null;
}) {
  const { t } = useI18n();
  const initial = transaction?.type ?? (TX_TYPES.includes(initialType as never) ? (initialType as TxType) : 'purchase');
  // Purchase / expense / payment behave the same; the main toggle is spending · income · transfer.
  const [kind, setKind] = useState<Kind>(kindOf(initial));
  const [spendType, setSpendType] = useState<TxType>(isSpending(initial) ? initial : 'purchase');
  const type: TxType = kind === 'spending' ? spendType : kind;
  const [categoryId, setCategoryId] = useState<string>(transaction?.categoryId ? String(transaction.categoryId) : '');
  const [account, setAccount] = useState<AccountId>(transaction?.account ?? defaultAccount);
  const [toAccount, setToAccount] = useState<AccountId | ''>(transaction?.toAccount ?? '');
  const [accountTouched, setAccountTouched] = useState(!!transaction);
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false);
  const isTransfer = type === 'transfer';
  const topCategories = topCategoryIds.map((id) => categories.find((c) => c.id === id)).filter((c): c is CategoryOption => !!c);
  const pickCategory = (value: string) => {
    setCategoryId(value);
    const key = categories.find((c) => String(c.id) === value)?.key;
    if (!accountTouched && !isTransfer && key && SUGGESTED_ACCOUNT[key]) setAccount(SUGGESTED_ACCOUNT[key]);
  };
  const hasDetails = !!(transaction && (transaction.subcategory || transaction.notes || transaction.attachment || transaction.recurring));

  return (
    <form action={saveTransactionAction} className="space-y-4">
      {transaction && <input type="hidden" name="id" value={transaction.id} />}
      <input type="hidden" name="back" value={back} />
      <input type="hidden" name="type" value={type} />

      {error === 'transfer' && (
        <p role="alert" className="rounded-control border border-negative/30 bg-negative/10 px-3 py-2 text-sm">
          {t('tx.transferError')}
        </p>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-control bg-raised p-1" role="radiogroup" aria-label={t('tx.type')}>
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`truncate rounded-[0.6rem] px-1 py-2 text-[13px] font-medium transition sm:text-sm ${kind === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink'}`}
          >
            {t(`tx.kinds.${k}`)}
          </button>
        ))}
      </div>

      <div>
        <Field label={`${t('common.amount')} (€)`}>
          <input
            name="amount"
            required
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            pattern="[0-9.,\s]*[0-9][0-9.,\s]*"
            defaultValue={transaction ? String(transaction.amount).replace('.', ',') : ''}
            className="input !py-3 text-3xl font-semibold tabular-nums tracking-tight sm:text-2xl"
            autoFocus={!transaction}
          />
        </Field>
      </div>

      <Field label={t('tx.description')}>
        <input name="description" required defaultValue={transaction?.description ?? ''} className="input" />
      </Field>

      <div>
        <span className="label">{t('tx.category')}</span>
        {topCategories.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {topCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={categoryId === String(c.id)}
                onClick={() => pickCategory(String(c.id))}
                className={`chip ${categoryId === String(c.id) ? 'chip-active' : ''}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.label}
              </button>
            ))}
          </div>
        )}
        <select name="categoryId" value={categoryId} aria-label={t('tx.category')} className="input" onChange={(e) => pickCategory(e.target.value)}>
          <option value="">{t('tx.noCategory')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('common.date')}>
          <input type="date" name="date" required defaultValue={transaction?.date ?? today} className="input" />
        </Field>
        <Field label={t('tx.merchant')}>
          <input name="merchant" list="merchants" defaultValue={transaction?.merchant ?? ''} className="input" />
          <datalist id="merchants">
            {merchants.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
      </div>

      <details open={hasDetails} className="rounded-control border border-line px-3 py-2">
        <summary className="cursor-pointer select-none py-1 text-sm font-medium">{t('tx.moreDetails')}</summary>
        <div className="mt-3 space-y-4 pb-2">
          {kind === 'spending' && (
            <Field label={t('tx.spendType')}>
              <select value={spendType} onChange={(e) => setSpendType(e.target.value as TxType)} className="input">
                {SPEND_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {t(`tx.types.${tp}`)}
                  </option>
                ))}
              </select>
            </Field>
          )}
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
                className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-raised file:px-3 file:py-2 file:text-sm file:text-ink"
              />
              {transaction?.attachment && (
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <a href={`/api/attachments/${encodeURIComponent(transaction.attachment)}`} target="_blank" rel="noreferrer" className="link">
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

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <a href={back} className="btn-ghost">
          {t('common.cancel')}
        </a>
        <SubmitButton label={t('common.save')} />
      </div>
    </form>
  );
}
