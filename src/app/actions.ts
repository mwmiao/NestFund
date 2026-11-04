'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { LOCALE_COOKIE, isLocale } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { UPLOADS_DIR } from '@/lib/db';
import { isISODate, isMonth, todayISO } from '@/lib/dates';
import { parseDecimal } from '@/lib/format';
import { tooMany } from '@/lib/rate-limit';
import * as repo from '@/lib/repo';
import { MAX_TEXT, clampText, safeLocalPath } from '@/lib/security';
import { connectT212, disconnectT212, syncT212 } from '@/lib/t212';
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
/** Free text with a length cap, so a single field can never hold megabytes. */
const text = (fd: FormData, k: string, max: number) => clampText(str(fd, k), max);
const optText = (fd: FormData, k: string, max: number) => text(fd, k, max) || null;
/** A category id that really exists (otherwise null), so a forged id can never reach the database. */
const existingCategoryId = (fd: FormData, k: string) => {
  const id = optId(fd, k);
  return id && repo.listCategories().some((c) => c.id === id) ? id : null;
};
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
const safeBack = (fd: FormData, fallback: string) => safeLocalPath(str(fd, 'back'), fallback);

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
const ATTACHMENT_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.heic']);
// The browser-reported type is not trusted on its own: the file name must also end in a known receipt/invoice extension.
const isAllowedAttachment = (file: File) =>
  file.size > 0 &&
  file.size <= MAX_ATTACHMENT_BYTES &&
  (file.type.startsWith('image/') || file.type === 'application/pdf') &&
  file.type !== 'image/svg+xml' &&
  ATTACHMENT_EXTENSIONS.has(path.extname(file.name).toLowerCase());

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
  const description = text(fd, 'description', MAX_TEXT.description);
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
    categoryId: existingCategoryId(fd, 'categoryId'),
    subcategory: optText(fd, 'subcategory', MAX_TEXT.subcategory),
    account,
    toAccount,
    paymentMethod: oneOf<PaymentMethod>(PAYMENT_METHODS, str(fd, 'paymentMethod'), type === 'transfer' ? 'transfer' : 'card'),
    merchant: optText(fd, 'merchant', MAX_TEXT.merchant),
    notes: optText(fd, 'notes', MAX_TEXT.notes),
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

// ---------------------------------------------------------------- categories

export async function saveCategoryAction(fd: FormData) {
  const name = text(fd, 'name', MAX_TEXT.name);
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
  const name = text(fd, 'name', MAX_TEXT.name);
  if (!name) return;
  const startMonth = optMonth(fd, 'startMonth');
  let endMonth = optMonth(fd, 'endMonth');
  if (startMonth && endMonth && endMonth < startMonth) endMonth = startMonth;
  repo.upsertBudgetItem({
    id: optId(fd, 'id') ?? undefined,
    name,
    kind: oneOf<BudgetItemKind>(BUDGET_ITEM_KINDS, str(fd, 'kind'), 'fixed'),
    amount: Math.abs(num(fd, 'amount')),
    categoryId: existingCategoryId(fd, 'categoryId'),
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
    notes: optText(fd, 'notes', MAX_TEXT.notes),
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
  const name = text(fd, 'name', MAX_TEXT.name);
  if (!name) return;
  const id = optId(fd, 'id');
  // Linked goals don't send a manual amount: keep the stored one instead of overwriting it with 0.
  const stored = id ? repo.listGoalsStored().find((g) => g.id === id) : undefined;
  repo.upsertGoal({
    id: id ?? undefined,
    kind: oneOf<GoalKind>(GOAL_KINDS, str(fd, 'kind'), 'custom'),
    name,
    target: Math.abs(num(fd, 'target')),
    current: fd.has('current') ? num(fd, 'current') : (stored?.current ?? 0),
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
    notes: optText(fd, 'notes', MAX_TEXT.notes),
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

// ---------------------------------------------------------------- onboarding (fresh start)

const nextStep = (step: repo.OnboardingStep) => {
  const i = repo.ONBOARDING_STEPS.indexOf(step);
  return i < repo.ONBOARDING_STEPS.length - 1 ? `/setup?step=${repo.ONBOARDING_STEPS[i + 1]}` : '/setup?step=done';
};

export async function setupBalancesAction(fd: FormData) {
  const date = todayISO();
  for (const account of ['ctt', 'revolut', 'trading212', 'traderepublic', 'meal_card'] as const) {
    const value = optNum(fd, account);
    if (value == null) continue;
    const invested = account === 'trading212' ? (optNum(fd, 'trading212_invested') ?? value) : value;
    repo.addSnapshot({ date, account, value, invested, notes: null });
  }
  repo.updateOnboarding({ complete: 'balances' });
  refresh();
  redirect(nextStep('balances'));
}

export async function setupIncomeAction(fd: FormData) {
  const salary = optNum(fd, 'salary');
  const mealCard = optNum(fd, 'mealCard');
  const profile = repo.getProfile();
  const income = salary ?? profile.defaultIncome;
  const meal = mealCard ?? profile.mealCard;
  repo.saveProfile({ ...profile, defaultIncome: income, incomeMin: income, incomeMax: income, mealCard: meal });
  repo.applyIncomeToOpenMonths(income, meal);
  repo.updateOnboarding({ complete: 'income' });
  refresh();
  redirect(nextStep('income'));
}

export async function setupFixedAction(fd: FormData) {
  const names = fd.getAll('name').map((v) => clampText(String(v), MAX_TEXT.name)).slice(0, 50);
  const validCategories = new Set(repo.listCategories().map((c) => c.id));
  const amounts = fd.getAll('amount').map(String);
  const accounts = fd.getAll('account').map(String);
  const categoryIds = fd.getAll('categoryId').map((v) => Number(v));
  names.forEach((raw, i) => {
    const name = raw.trim();
    const amount = parseDecimal(amounts[i] ?? '');
    if (!name || amount == null || amount <= 0) return;
    repo.upsertBudgetItem({
      name,
      kind: 'fixed',
      amount,
      categoryId: validCategories.has(categoryIds[i]) ? categoryIds[i] : null,
      account: ACCOUNT_IDS.includes(accounts[i] as AccountId) ? (accounts[i] as AccountId) : 'ctt',
      startMonth: null,
      endMonth: null,
    });
  });
  repo.updateOnboarding({ complete: 'fixed' });
  refresh();
  redirect(nextStep('fixed'));
}

export async function setupGoalsAction(fd: FormData) {
  const existing = repo.listGoals();
  const { t } = await getI18n();
  const goals = [
    { kind: 'emergency' as const, name: t('goals.kinds.emergency'), color: '#0ea5e9', prefix: 'emergency' },
    { kind: 'house' as const, name: t('goals.kinds.house'), color: '#a855f7', prefix: 'house' },
  ];
  for (const g of goals) {
    const target = optNum(fd, `${g.prefix}Target`);
    if (target == null || target <= 0) continue;
    const current = existing.find((x) => x.kind === g.kind);
    repo.upsertGoal({
      id: current?.id,
      kind: g.kind,
      name: current?.name ?? g.name,
      target,
      current: 0,
      monthly: Math.abs(optNum(fd, `${g.prefix}Monthly`) ?? current?.monthly ?? 0),
      targetDate: optMonth(fd, `${g.prefix}Date`) ?? current?.targetDate ?? null,
      color: current?.color ?? g.color,
      // Both goals follow the Trade Republic balance.
      account: 'traderepublic',
    });
  }
  repo.updateOnboarding({ complete: 'goals' });
  refresh();
  redirect(nextStep('goals'));
}

export async function dismissOnboardingAction() {
  repo.updateOnboarding({ dismissed: true });
  refresh();
  redirect('/');
}

export async function resetDataAction(fd: FormData) {
  if (str(fd, 'confirm') !== '1' || (await tooMany('reset-data', 3, 60 * 60 * 1000))) redirect('/setup#reset');
  repo.resetData();
  await fs.rm(UPLOADS_DIR, { recursive: true, force: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  refresh();
  redirect('/setup?reset=1');
}

// ---------------------------------------------------------------- Trading 212 (read-only API)

export type T212ActionState = { ok: boolean; code?: string } | null;

export async function connectT212Action(_prev: T212ActionState, fd: FormData): Promise<T212ActionState> {
  // Attempts to validate a key are limited, so the form cannot be used to hammer the Trading 212 API.
  if (await tooMany('connect-t212', 5, 10 * 60 * 1000)) return { ok: false, code: 'too_soon' };
  const apiKey = clampText(str(fd, 'apiKey'), 300);
  const apiSecret = clampText(str(fd, 'apiSecret'), 300);
  if (!apiKey) return { ok: false, code: 'missing_key' };
  const result = await connectT212({ env: str(fd, 'env') === 'demo' ? 'demo' : 'live', apiKey, apiSecret: apiSecret || undefined });
  refresh();
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}

export async function syncT212Action(_prev: T212ActionState): Promise<T212ActionState> {
  const result = await syncT212({ force: true });
  refresh();
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}

export async function disconnectT212Action() {
  disconnectT212();
  refresh();
}
