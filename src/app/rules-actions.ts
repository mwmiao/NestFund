'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { listCategories } from '@/lib/repo';
import { applyRule, deleteRule, getRule, moveRule, saveRule, setRuleEnabled } from '@/lib/rules-repo';
import { MAX_TEXT, clampText } from '@/lib/security';
import { ACCOUNT_IDS, type AccountId } from '@/lib/types';

const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const posInt = (fd: FormData, k: string) => {
  const n = Number(str(fd, k));
  return Number.isInteger(n) && n > 0 ? n : null;
};

function refresh() {
  revalidatePath('/', 'layout');
}

/** Creates or edits a rule. Never touches existing transactions: "apply to old ones" only opens the preview page. */
export async function saveRuleAction(fd: FormData) {
  const text = clampText(str(fd, 'text'), MAX_TEXT.ruleText);
  const categoryId = posInt(fd, 'categoryId');
  const accountRaw = str(fd, 'account');
  const account = ACCOUNT_IDS.includes(accountRaw as AccountId) ? (accountRaw as AccountId) : null;
  if (!text || !categoryId || !listCategories().some((c) => c.id === categoryId)) redirect('/transactions/rules');
  const id = saveRule({ id: posInt(fd, 'id') ?? undefined, text, account, categoryId });
  refresh();
  if (str(fd, 'applyAfter') === '1') redirect(`/transactions/rules/apply?rule=${id}`);
  redirect('/transactions/rules');
}

export async function toggleRuleAction(fd: FormData) {
  const id = posInt(fd, 'id');
  if (id) setRuleEnabled(id, str(fd, 'enabled') === '1');
  refresh();
}

export async function moveRuleAction(fd: FormData) {
  const id = posInt(fd, 'id');
  if (id) moveRule(id, str(fd, 'direction') === 'up' ? 'up' : 'down');
  refresh();
}

export async function deleteRuleAction(fd: FormData) {
  const id = posInt(fd, 'id');
  if (id) deleteRule(id);
  refresh();
}

/** Applies a rule to the transactions ticked on the preview page, and only those. */
export async function applyRuleAction(fd: FormData) {
  const rule = getRule(posInt(fd, 'rule') ?? 0);
  if (!rule) redirect('/transactions/rules');
  const ids = fd
    .getAll('ids')
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
  const { changed } = ids.length ? applyRule(rule, ids) : { changed: 0 };
  refresh();
  redirect(`/transactions/rules?applied=${changed}`);
}
