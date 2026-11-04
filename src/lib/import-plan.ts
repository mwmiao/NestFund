import 'server-only';
import { dictionaries } from '@/i18n/config';
import { emptyData, planRestore, validateBackup, type BackupData, type BCategory, type InvalidItem, type RestorePlan } from './backup-format';
import { readBackupData, type StagedKind } from './backup';
import { parseTransactionsCsv, type CsvInvalid } from './tx-csv';

export type ImportPlanResult =
  | { ok: false; error: 'notJson' | 'notBackup' | 'newerVersion' | 'empty' | 'noHeader' }
  | {
      ok: true;
      kind: StagedKind;
      plan: RestorePlan;
      /** Every transaction in the file (used to resume recurring series without repeating occurrences). */
      fileTransactions: BackupData['transactions'];
      invalid: InvalidItem[];
      csvInvalid: CsvInvalid[];
      exportedAt: string;
      period: { from: string | null; to: string | null } | null;
    };

/** Category text from a CSV → ref of an existing category (by key, name or a translated built-in name), else a new custom one. */
function makeResolver(current: BCategory[], created: Map<string, BCategory>) {
  return (raw: string): string | null => {
    const n = raw.trim();
    if (!n) return null;
    const lower = n.toLocaleLowerCase('pt-PT');
    const key =
      Object.values(dictionaries)
        .flatMap((d) => Object.entries(d.categories))
        .find(([, label]) => typeof label === 'string' && label.toLocaleLowerCase('pt-PT') === lower)?.[0] ?? n;
    const hit = current.find((c) => c.name.toLowerCase() === n.toLowerCase() || (c.key ?? '').toLowerCase() === key.toLowerCase());
    if (hit) return hit.ref;
    const ref = `custom:${n.toLowerCase()}`;
    if (!created.has(ref)) created.set(ref, { ref, key: null, name: n, color: '#71717a', kind: 'expense', monthlyBudget: null, builtin: false });
    return ref;
  };
}

/** Recomputed from the staged file and the database as it is right now, for the preview and again at confirmation. */
export function buildImportPlan(kind: StagedKind, content: string): ImportPlanResult {
  const current = readBackupData(null);
  if (kind === 'json') {
    const v = validateBackup(content);
    if (!v.ok) return v;
    return {
      ok: true,
      kind,
      plan: planRestore(v.file.data, current),
      fileTransactions: v.file.data.transactions,
      invalid: v.invalid,
      csvInvalid: [],
      exportedAt: v.file.exportedAt,
      period: v.file.period,
    };
  }
  const created = new Map<string, BCategory>();
  const parsed = parseTransactionsCsv(content, makeResolver(current.categories, created));
  if (!parsed.hasHeader) return { ok: false, error: 'noHeader' };
  const data: BackupData = { ...emptyData(), categories: [...created.values()], transactions: parsed.transactions };
  return { ok: true, kind, plan: planRestore(data, current), fileTransactions: parsed.transactions, invalid: [], csvInvalid: parsed.invalid, exportedAt: '', period: null };
}
