'use client';

import { useState } from 'react';
import { deleteGoalAction, saveGoalAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Field } from '@/components/ui';
import { useI18n } from '@/i18n/client';
import { toInputDecimal } from '@/lib/format';
import { accountName } from '@/lib/labels';
import { ACCOUNT_IDS, GOAL_KINDS, type AccountId, type Goal } from '@/lib/types';

/**
 * Create/edit a goal. A goal linked to an account takes its progress from that account's
 * balance, so the manual amount field is only shown (and only sent) when no account is linked.
 */
export function GoalForm({ goal, manualCurrent }: { goal?: Goal; manualCurrent?: number }) {
  const { t } = useI18n();
  const [account, setAccount] = useState<string>(goal?.account ?? '');
  const linked = account !== '';

  return (
    <form action={saveGoalAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {goal && <input type="hidden" name="id" value={goal.id} />}
      <Field label={t('common.name')}>
        <input name="name" required defaultValue={goal?.name ?? ''} className="input" />
      </Field>
      <Field label={t('common.kind')}>
        <select name="kind" defaultValue={goal?.kind ?? 'custom'} className="input">
          {GOAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`goals.kinds.${k}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={`${t('goals.target')} (€)`}>
        <input name="target" required inputMode="decimal" defaultValue={goal ? toInputDecimal(goal.target) : ''} className="input tabular-nums" />
      </Field>
      <Field label={`${t('goals.monthly')} (€)`}>
        <input name="monthly" inputMode="decimal" defaultValue={goal ? toInputDecimal(goal.monthly) : ''} className="input tabular-nums" />
      </Field>

      <Field label={t('goals.progressSource')} className="sm:col-span-2">
        <select name="account" value={account} onChange={(e) => setAccount(e.target.value)} className="input">
          <option value="">{t('goals.manual')}</option>
          {ACCOUNT_IDS.map((a) => (
            <option key={a} value={a}>
              {t('goals.fromAccountOption', { account: accountName(a, t) })}
            </option>
          ))}
        </select>
      </Field>
      {linked ? (
        <p className="muted rounded-control bg-raised px-3 py-2 text-xs sm:col-span-2">
          {t('goals.linkedHint', { account: accountName(account as AccountId, t) })}
        </p>
      ) : (
        <Field label={`${t('goals.current')} (€)`} className="sm:col-span-2">
          <input name="current" inputMode="decimal" defaultValue={toInputDecimal(manualCurrent ?? 0)} className="input tabular-nums" />
        </Field>
      )}

      <Field label={`${t('goals.targetDate')} (${t('common.optional')})`}>
        <input type="month" name="targetDate" defaultValue={goal?.targetDate ?? ''} className="input" />
      </Field>
      <Field label={t('common.color')}>
        <input type="color" name="color" defaultValue={goal?.color ?? '#10b981'} className="h-[2.75rem] w-16 cursor-pointer rounded-control border border-line bg-transparent p-1" />
      </Field>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3 sm:col-span-2">
        {goal && <ConfirmButton formAction={deleteGoalAction}>{t('common.delete')}</ConfirmButton>}
        <button className="btn-primary">{goal ? t('common.save') : t('common.add')}</button>
      </div>
    </form>
  );
}
