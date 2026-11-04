'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveTransactionAction } from '@/app/actions';
import { Field, Spinner } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { suggestCategory, type HistoryHints, type RuleLike } from '@/lib/categorize';
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
  kind?: string;
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

function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary min-h-12 flex-[2] sm:flex-none" disabled={pending}>
      {pending ? <Spinner /> : label}
    </button>
  );
}

function AccountChips({ name, value, onChange, exclude }: { name: string; value: AccountId | ''; onChange: (a: AccountId) => void; exclude?: AccountId }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
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
            className={`min-h-10 rounded-full border px-3.5 py-2 text-[13px] font-medium transition ${active ? 'text-white' : 'border-line text-subtle hover:text-ink'}`}
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
  suggest,
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
  /** Rules + history used to suggest a category; suggestions are only ever offered, never applied on their own. */
  suggest?: { rules: RuleLike[]; history: HistoryHints };
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
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [merchant, setMerchant] = useState(transaction?.merchant ?? '');
  const [date, setDate] = useState(transaction?.date ?? today);
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false);
  const isTransfer = type === 'transfer';
  const topCategories = topCategoryIds.map((id) => categories.find((c) => c.id === id)).filter((c): c is CategoryOption => !!c);
  const pickCategory = (value: string) => {
    setCategoryId(value);
    const key = categories.find((c) => String(c.id) === value)?.key;
    if (!accountTouched && !isTransfer && key && SUGGESTED_ACCOUNT[key]) setAccount(SUGGESTED_ACCOUNT[key]);
  };
  // The suggestion scans the user's history, so it runs on the deferred text: typing stays instant, the hint follows a moment later.
  const typedDescription = useDeferredValue(description);
  const typedMerchant = useDeferredValue(merchant);
  const categoryLikes = useMemo(() => categories.map((c) => ({ id: c.id, key: c.key, kind: c.kind ?? 'expense' })), [categories]);
  const suggestion = useMemo(
    () => (suggest && !categoryId ? suggestCategory({ description: typedDescription, merchant: typedMerchant, account, kind }, { rules: suggest.rules, history: suggest.history, categories: categoryLikes }) : null),
    [suggest, categoryId, typedDescription, typedMerchant, account, kind, categoryLikes],
  );
  const suggested = suggestion ? categories.find((c) => c.id === suggestion.categoryId) : undefined;
  const yesterday = shiftDay(today, -1);
  const hasDetails = !!(transaction && (transaction.subcategory || transaction.notes || transaction.attachment || transaction.recurring));

  return (
    <form
      action={saveTransactionAction}
      className="space-y-4"
      onSubmit={(e) => {
        // Description is optional in the UI: fall back to the merchant, the category or the type so a log takes seconds.
        const f = e.currentTarget.elements;
        const desc = f.namedItem('description') as HTMLInputElement | null;
        if (desc && !desc.value.trim()) {
          const merchant = (f.namedItem('merchant') as HTMLInputElement | null)?.value.trim();
          desc.value = merchant || categories.find((c) => String(c.id) === categoryId)?.label || t(`tx.kinds.${kind}`);
        }
      }}
    >
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
            className={`min-h-11 truncate rounded-[0.6rem] px-1 py-2 text-[13px] font-medium transition sm:text-sm ${kind === k ? 'bg-surface text-ink shadow-sm' : 'text-subtle hover:text-ink'}`}
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
        <input name="description" value={description} onChange={(e) => setDescription(e.target.value)} enterKeyHint="done" placeholder={categories.find((c) => String(c.id) === categoryId)?.label ?? t(`tx.kinds.${kind}`)} className="input" />
      </Field>

      <div>
        <span className="label">{t('tx.category')}</span>
        {suggestion && suggested && (
          <button
            type="button"
            onClick={() => pickCategory(String(suggested.id))}
            className="mb-2 flex min-h-12 w-full items-center gap-3 rounded-control border border-brand-500/40 bg-brand-500/10 px-3 py-2 text-left transition active:scale-[0.99]"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: suggested.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {t('tx.suggestFor')}: {suggested.label}
              </span>
              <span className="muted block truncate text-xs">
                {t(suggestion.source === 'rule' ? 'tx.suggestRule' : suggestion.source === 'history' ? 'tx.suggestHistory' : 'tx.suggestKeyword', { text: suggestion.matched })}
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">{t('tx.suggestAccept')}</span>
          </button>
        )}
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

      <div>
        <span className="label">{t('common.date')}</span>
        <div className="flex flex-wrap items-center gap-2">
          {[
            [today, t('common.today')],
            [yesterday, t('common.yesterday')],
          ].map(([value, label]) => (
            <button key={value} type="button" aria-pressed={date === value} onClick={() => setDate(value)} className={`chip !min-h-10 !px-3.5 !text-[13px] ${date === value ? 'chip-active' : ''}`}>
              {label}
            </button>
          ))}
          <input type="date" name="date" required value={date} onChange={(e) => setDate(e.target.value)} aria-label={t('common.date')} className="input !w-auto min-w-0 flex-1 basis-36" />
        </div>
      </div>

      <Field label={`${t('tx.merchant')} (${t('common.optional')})`}>
        <input name="merchant" list="merchants" enterKeyHint="done" value={merchant} onChange={(e) => setMerchant(e.target.value)} className="input" />
        <datalist id="merchants">
          {merchants.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>

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

      <div className="sticky bottom-[calc(3.6rem+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:static sm:mx-0 sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <a href={back} className="btn-ghost flex-1 sm:flex-none">
          {t('common.cancel')}
        </a>
        <SubmitButton label={t('common.save')} />
      </div>
    </form>
  );
}
