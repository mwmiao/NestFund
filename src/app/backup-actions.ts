'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appVersion, applyRestore, createBackupNow, discardStaged, readStaged, stageImport } from '@/lib/backup';
import { buildImportPlan } from '@/lib/import-plan';
import { tooMany } from '@/lib/rate-limit';

// Matches the 10 MB request-body limit of server actions (next.config.ts).
const MAX_IMPORT_BYTES = 9 * 1024 * 1024;

export async function createBackupAction() {
  if (await tooMany('backup-now', 6, 10 * 60 * 1000)) redirect('/settings/backup?importError=rate');
  createBackupNow(appVersion());
  revalidatePath('/settings/backup');
  redirect('/settings/backup?created=1');
}

/** Step 1 of an import: only stores the upload. Nothing in the database changes until the preview is confirmed. */
export async function stageImportAction(fd: FormData) {
  const file = fd.get('file');
  const back = '/settings/backup';
  if (await tooMany('import-stage', 20, 10 * 60 * 1000)) redirect(`${back}?importError=rate`);
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_IMPORT_BYTES) redirect(`${back}?importError=file`);
  const name = file.name.toLowerCase();
  const kind = name.endsWith('.json') ? 'json' : name.endsWith('.csv') || file.type === 'text/csv' ? 'csv' : null;
  if (!kind) redirect(`${back}?importError=file`);
  const token = stageImport(kind, await file.text());
  redirect(`/settings/backup/import?token=${token}`);
}

/** Step 2: applies the same plan that was previewed (recomputed against the database as it is now). */
export async function confirmImportAction(fd: FormData) {
  if (await tooMany('import-confirm', 10, 10 * 60 * 1000)) redirect('/settings/backup?importError=rate');
  const token = String(fd.get('token') ?? '');
  const staged = readStaged(token);
  if (!staged) redirect('/settings/backup?importError=expired');
  const result = buildImportPlan(staged.kind, staged.content);
  if (!result.ok) redirect('/settings/backup?importError=file');
  const { created, updated } = applyRestore(result.plan, result.fileTransactions);
  discardStaged(token);
  revalidatePath('/', 'layout');
  redirect(`/settings/backup?imported=${created}-${updated}`);
}

export async function cancelImportAction(fd: FormData) {
  discardStaged(String(fd.get('token') ?? ''));
  redirect('/settings/backup');
}
