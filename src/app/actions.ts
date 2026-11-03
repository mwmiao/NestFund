'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { LOCALE_COOKIE, isLocale } from '@/i18n/config';
import { UPLOADS_DIR } from '@/lib/db';
import { isISODate, isMonth, todayISO } from '@/lib/dates';
import { parseDecimal } from '@/lib/format';
import * as repo from '@/lib/repo';
import { importTransactionsCsv } from '@/lib/csv-import';
import {
  ACCOUNT_IDS,
  BUDGET_ITEM_KINDS,
  CATEGORY_KINDS,
  GOAL_KINDS,
  PAYMENT_METHODS,
  RECURRENCES,
  TX_TYPES,
  type AccountId,
  type BudgetItemKind,
  type CategoryKind,
  type GoalKind,
  type PaymentMethod,
  type Recurrence,
  type TxType,
} from '@/lib/types';

const ONE_YEAR = 60 * 60 * 24 * 365;

// ---------------------------------------------------------------- form helpers

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const optStr = (fd: FormData, k: string) => str(fd, k) || null;
const num = (fd: FormData, k: string, fallback = 0) => parseDecimal(str(fd, k)) ?? fallback;
const optNum = (fd: FormData, k: string) => parseDecimal(str(fd, k));
const optId = (fd: FormData, k: string) => {
  const n = Number(str(fd, k));
  return Number.isInteger(n) && n > 0 ? n : null;
};
const oneOf = <T extends string>(list: readonly T[], v: string, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const optMonth = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return isMonth(v) ? v : null;
};
const optAccount = (fd: FormData, k: string): AccountId | null => (ACCOUNT_IDS.includes(str(fd, k) as AccountId) ? (str(fd, k) as AccountId) : null);
const color = (fd: FormData) => (/^#[0-9a-fA-F]{6}$/.test(str(fd, 'color')) ? str(fd, 'color') : '#71717a');

/** Only allow redirecting back to a local path. */
const safeBack = (fd: FormData, fallback: string) => {
  const v = str(fd, 'back');
  return v.startsWith('/') && !v.startsWith('//') ? v : fallback;
};

const withParam = (url: string, key: string, value: string) => `${url}${url.includes('?') ? '&' : '?'}${key}=${value}`;

function refresh() {
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------- preferences

export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { path: '/', maxAge: ONE_YEAR, sameSite: 'lax' });
  refresh();
}

export async function setThemeAction(theme: string) {
  (await cookies()).set('theme', theme === 'light' ? 'light' : 'dark', { path: '/', maxAge: ONE_YEAR, sameSite: 'lax' });
  refresh();
}

// ---------------------------------------------------------------- transactions

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const isAllowedAttachment = (file: File) =>
  file.size > 0 && file.size <= MAX_ATTACHMENT_BYTES && (file.type.startsWith('image/') || file.type === 'application/pdf') && file.type !== 'image/svg+xml';

async function storeAttachment(file: File): Promise<string> {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const stored = `${crypto.randomUUID()}-${safeName}`;
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, stored), Buffer.from(await file.arrayBuffer()));
  return stored;
}

async function removeAttachment(name: string | null) {
  if (!name) return;
  await fs.unlink(path.join(UPLOADS_DIR, path.basename(name))).catch(() => undefined);
}

export async function saveTransactionAction(fd: FormData) {
  const id = optId(fd, 'id');
  const existing = id ? repo.getTransaction(id) : null;
  const amount = Math.abs(num(fd, 'amount'));
  const description = str(fd, 'description');
  if (!amount || !description) redirect(safeBack(fd, '/transactions'));

  let attachment = existing?.attachment ?? null;
  const file = fd.get('attachment');
  if (str(fd, 'removeAttachment') === '1') {
    await removeAttachment(attachment);
    attachment = null;
  }
  if (file instanceof File && isAllowedAttachment(file)) {
    await removeAttachment(attachment);
    attachment = await storeAttachment(file);
  }

  const recurring = str(fd, 'recurring') === '1';
  const date = str(fd, 'date');
  const type = oneOf<TxType>(TX_TYPES, str(fd, 'type'), 'purchase');
  const account = optAccount(fd, 'account') ?? 'ctt';
  const toAccount = type === 'transfer' ? optAccount(fd, 'toAccount') : null;
  // A transfer needs a different destination; otherwise fall back to the form so the user can fix it.
  if (type === 'transfer' && (!toAccount || toAccount === account)) redirect(`/transactions/${id ?? 'new'}?error=transfer`);
  repo.upsertTransaction({
    id: id ?? undefined,
    date: isISODate(date) ? date : todayISO(),
    amount,
    type,
    description,
    categoryId: optId(fd, 'categoryId'),
    subcategory: optStr(fd, 'subcategory'),
    account,
    toAccount,
    paymentMethod: oneOf<PaymentMethod>(PAYMENT_METHODS, str(fd, 'paymentMethod'), type === 'transfer' ? 'transfer' : 'card'),
    merchant: optStr(fd, 'merchant'),
    notes: optStr(fd, 'notes'),
    attachment,
    recurring,
    recurrence: recurring ? oneOf<Recurrence>(RECURRENCES, str(fd, 'recurrence'), 'monthly') : null,
  });
  repo.materializeRecurring();
  refresh();
  redirect(withParam(safeBack(fd, '/transactions'), 'saved', '1'));
}

export async function deleteTransactionAction(fd: FormData) {
  const id = optId(fd, 'id');
  if (id) await removeAttachment(repo.deleteTransaction(id));
  refresh();
  redirect(safeBack(fd, '/transactions'));
}

export async function importCsvAction(_prev: unknown, fd: FormData): Promise<{ imported: number; skipped: number } | null> {
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return null;
  const result = importTransactionsCsv(await file.text());
  refresh();
  return result;
}

// ---------------------------------------------------------------- categories

export async function saveCategoryAction(fd: FormData) {
  const name = str(fd, 'name');
  if (!name) return;
  repo.upsertCategory({
    id: optId(fd, 'id') ?? undefined,
    // An unchanged (translated) name keeps the stored name, so built-in categories stay translatable.
    name: name === str(fd, 'displayName') ? null : name,
    color: color(fd),
    kind: oneOf<CategoryKind>(CATEGORY_KINDS, str(fd, 'kind'), 'expense'),
    monthlyBudget: optNum(fd, 'monthlyBudget'),
  });
  refresh();
}

export async function deleteCategoryAction(fd: FormData) {
  const id = optId(fd, 'id');
  if (id) repo.deleteCategory(id);
  refresh();
}

// ---------------------------------------------------------------- budget

export async function saveBudgetItemAction(fd: FormData) {
  const name = str(fd, 'name');
  if (!name) return;
  const startMonth = optMonth(fd, 'startMonth');
  let endMonth = optMonth(fd, 'endMonth');
  if (startMonth && endMonth && endMonth < startMonth) endMonth = startMonth;
  repo.upsertBudgetItem({
    id: optId(fd, 'id') ?? undefined,
    name,
    kind: oneOf<BudgetItemKind>(BUDGET_ITEM_KINDS, str(fd, 'kind'), 'fixed'),
    amount: Math.abs(num(fd, 'amount')),
    categoryId: optId(fd, 'categoryId'),
    account: optAccount(fd, 'account'),
    startMonth,
    endMonth,
  });
  refresh();
}

export async function deleteBudgetItemAction(fd: FormData) {
  const id = optId(fd, 'id');
  if (id) repo.deleteBudgetItem(id);
  refresh();
}

export async function saveMonthBudgetAction(fd: FormData) {
  const month = optMonth(fd, 'month');
  if (!month) return;
  repo.updateMonthBudget(month, {
    income: num(fd, 'income'),
    extraIncome: num(fd, 'extraIncome'),
    mealCard: num(fd, 'mealCard'),
    notes: optStr(fd, 'notes'),
  });
  refresh();
}

export async function saveProfileAction(fd: FormData) {
  const current = repo.getProfile();
  repo.saveProfile({
    incomeMin: num(fd, 'incomeMin', current.incomeMin),
    incomeMax: num(fd, 'incomeMax', current.incomeMax),
    defaultIncome: num(fd, 'defaultIncome', current.defaultIncome),
    mealCard: num(fd, 'mealCard', current.mealCard),
    transportAllowance: num(fd, 'transportAllowance', current.transportAllowance),
    annualBonus: num(fd, 'annualBonus', current.annualBonus),
  });
  refresh();
}

// ---------------------------------------------------------------- goals

export async function saveGoalAction(fd: FormData) {
  const name = str(fd, 'name');
  if (!name) return;
  repo.upsertGoal({
    id: optId(fd, 'id') ?? undefined,
    kind: oneOf<GoalKind>(GOAL_KINDS, str(fd, 'kind'), 'custom'),
    name,
    target: Math.abs(num(fd, 'target')),
    current: num(fd, 'current'),
    monthly: Math.abs(num(fd, 'monthly')),
    targetDate: optMonth(fd, 'targetDate'),
    color: color(fd),
    account: optAccount(fd, 'account'),
  });
  refresh();
}

export async function deleteGoalAction(fd: FormData) {
  const id = optId(fd, 'id');
  if (id) repo.deleteGoal(id);
  refresh();
}

// ---------------------------------------------------------------- portfolio

export async function saveSnapshotAction(fd: FormData) {
  const account = optAccount(fd, 'account') ?? 'trading212';
  const value = optNum(fd, 'value');
  if (value == null) return;
  const date = str(fd, 'date');
  repo.addSnapshot({
    date: isISODate(date) ? date : todayISO(),
    account,
    value,
    // Only Trading 212 has a cost basis different from its balance.
    invested: account === 'trading212' ? (optNum(fd, 'invested') ?? value) : value,
    notes: optStr(fd, 'notes'),
  });
  refresh();
  const back = safeBack(fd, '');
  if (back) redirect(back);
}

export async function deleteSnapshotAction(fd: FormData) {
  const id = optId(fd, 'id');
  if (id) repo.deleteSnapshot(id);
  refresh();
}
