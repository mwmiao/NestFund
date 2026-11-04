'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { parseDecimal } from '@/lib/format';
import { getInterestConfig, saveInterestConfig } from '@/lib/interest-repo';

const num = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? parseDecimal(v) : null;
};
const lag = (fd: FormData, k: string, fallback: number) => {
  const n = Number(fd.get(k));
  return Number.isInteger(n) && n >= 0 && n <= 3 ? n : fallback;
};

/**
 * Saves the interest settings. Only future calculations change: credits already booked keep the rate and tax they were
 * computed with, and no transaction, balance or history is touched.
 */
export async function saveInterestConfigAction(fd: FormData) {
  const current = getInterestConfig();
  const rate = num(fd, 'annualRate');
  const tax = num(fd, 'taxRate');
  saveInterestConfig({
    enabled: fd.get('enabled') === '1',
    // Percentages typed by the user; out-of-range or unreadable values keep the previous setting.
    annualRate: rate != null && rate >= 0 && rate <= 20 ? rate / 100 : current.annualRate,
    taxRate: tax != null && tax >= 0 && tax <= 60 ? tax / 100 : current.taxRate,
    depositLagDays: lag(fd, 'depositLagDays', current.depositLagDays),
    withdrawalLagDays: lag(fd, 'withdrawalLagDays', current.withdrawalLagDays),
  });
  revalidatePath('/', 'layout');
  redirect('/portfolio');
}
