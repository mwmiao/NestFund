'use client';

import { useState } from 'react';
import { saveMonthIncomeAction } from '@/app/actions';
import { useI18n } from '@/i18n/client';
import { formatMoney, parseDecimal, toInputDecimal } from '@/lib/format';
import { estimateFromDays, paidDayEquivalents } from '@/lib/payday';

export interface IncomeFormInitial {
  month: string;
  salary: number;
  meal: number;
  extraIncome: number;
  notes: string;
  normalDays: number;
  holidayDays: number;
  salaryPerDay: number | null;
  mealPerDay: number | null;
  salaryConfirmed: boolean;
  mealConfirmed: boolean;
  salaryPaidDate: string;
  mealPaidDate: string;
  defined: boolean;
  /** Pre-filled daily rates come from an earlier month: they are suggestions, never values. */
  ratesFromPast: boolean;
}

const dec = (v: number | null) => (v == null ? '' : toInputDecimal(v));

/** Manual income of the month: salary + meal card (always editable), with an optional estimate from days worked. */
export function IncomeForm({ init, expectedSalaryText, expectedMealText }: { init: IncomeFormInitial; expectedSalaryText: string; expectedMealText: string }) {
  const { t, locale } = useI18n();
  const money = (v: number) => formatMoney(v, locale);
  const [salary, setSalary] = useState(init.defined ? dec(init.salary) : '');
  const [meal, setMeal] = useState(init.defined ? dec(init.meal) : '');
  const [normal, setNormal] = useState(init.normalDays ? String(init.normalDays).replace('.', ',') : '');
  const [holiday, setHoliday] = useState(init.holidayDays ? String(init.holidayDays).replace('.', ',') : '');
  const [salaryDay, setSalaryDay] = useState(dec(init.salaryPerDay));
  const [mealDay, setMealDay] = useState(dec(init.mealPerDay));

  const n = parseDecimal(normal) ?? 0;
  const h = parseDecimal(holiday) ?? 0;
  const salaryEstimate = estimateFromDays({ normalDays: n, holidayDays: h, perDay: parseDecimal(salaryDay) ?? 0 });
  const mealEstimate = estimateFromDays({ normalDays: n, holidayDays: h, perDay: parseDecimal(mealDay) ?? 0 });
  const equivalents = paidDayEquivalents(n, h);

  return (
    <form action={saveMonthIncomeAction} className="space-y-4">
      <input type="hidden" name="month" value={init.month} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="block">
            <span className="label">{t('income.salary')} (€)</span>
            <input name="salary" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} placeholder="0,00" className="input tabular-nums" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="salaryConfirmed" defaultChecked={init.salaryConfirmed} className="h-4 w-4 accent-brand-500" />
            {t('income.receivedConfirm')}
          </label>
          <label className="block">
            <span className="label">{t('income.paidDate')}</span>
            <input type="date" name="salaryPaidDate" defaultValue={init.salaryPaidDate} className="input" />
            <span className="muted mt-1 block text-xs">{expectedSalaryText}</span>
          </label>
        </div>
        <div className="space-y-2">
          <label className="block">
            <span className="label">{t('income.meal')} (€)</span>
            <input name="meal" inputMode="decimal" value={meal} onChange={(e) => setMeal(e.target.value)} placeholder="0,00" className="input tabular-nums" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="mealConfirmed" defaultChecked={init.mealConfirmed} className="h-4 w-4 accent-brand-500" />
            {t('income.receivedConfirm')}
          </label>
          <label className="block">
            <span className="label">{t('income.mealPaidDate')}</span>
            <input type="date" name="mealPaidDate" defaultValue={init.mealPaidDate} className="input" />
            <span className="muted mt-1 block text-xs">{expectedMealText}</span>
          </label>
        </div>
      </div>
      <p className="muted text-xs">{t('income.mealSeparate')}</p>

      <details open={!init.defined} className="rounded-control border border-line p-3">
        <summary className="cursor-pointer select-none text-sm font-medium">{t('income.estimateTitle')}</summary>
        <p className="muted mt-2 text-xs">{t('income.estimateHint')}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="label">{t('income.normalDays')}</span>
            <input name="normalDays" inputMode="decimal" value={normal} onChange={(e) => setNormal(e.target.value)} className="input tabular-nums" />
          </label>
          <label className="block">
            <span className="label">{t('income.holidayDays')}</span>
            <input name="holidayDays" inputMode="decimal" value={holiday} onChange={(e) => setHoliday(e.target.value)} className="input tabular-nums" />
          </label>
          <label className="block">
            <span className="label">{t('income.salaryPerDay')} (€)</span>
            <input name="salaryPerDay" inputMode="decimal" value={salaryDay} onChange={(e) => setSalaryDay(e.target.value)} className="input tabular-nums" />
          </label>
          <label className="block">
            <span className="label">{t('income.mealPerDay')} (€)</span>
            <input name="mealPerDay" inputMode="decimal" value={mealDay} onChange={(e) => setMealDay(e.target.value)} className="input tabular-nums" />
          </label>
        </div>
        {init.ratesFromPast && <p className="muted mt-2 text-xs">{t('income.ratesSuggested')}</p>}
        <p className="muted mt-3 text-xs">{t('income.paidEquivalents', { days: String(equivalents).replace('.', ',') })}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" disabled={salaryEstimate <= 0} onClick={() => setSalary(toInputDecimal(salaryEstimate))} className="btn-secondary">
            {t('income.useSalaryEstimate', { amount: money(salaryEstimate) })}
          </button>
          <button type="button" disabled={mealEstimate <= 0} onClick={() => setMeal(toInputDecimal(mealEstimate))} className="btn-secondary">
            {t('income.useMealEstimate', { amount: money(mealEstimate) })}
          </button>
        </div>
      </details>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">{t('budget.extraIncome')} (€)</span>
          <input name="extraIncome" inputMode="decimal" defaultValue={init.extraIncome ? toInputDecimal(init.extraIncome) : ''} placeholder="0,00" className="input tabular-nums" />
        </label>
        <label className="block">
          <span className="label">{t('common.notes')}</span>
          <input name="notes" defaultValue={init.notes} className="input" />
        </label>
      </div>
      <button className="btn-primary">{t('common.save')}</button>
    </form>
  );
}
