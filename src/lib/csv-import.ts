import 'server-only';
import { parseCsv } from './csv';
import { parseFlexibleDate } from './dates';
import { parseDecimal } from './format';
import { findOrCreateCategory, upsertTransaction } from './repo';
import { ACCOUNTS, ACCOUNT_IDS, PAYMENT_METHODS, TX_TYPES, type AccountId, type PaymentMethod, type TxType } from './types';

/** Accepts account ids ("revolut") or display names ("Banco CTT", "Trade Republic"). */
function parseAccount(raw: string): AccountId | null {
  const v = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!v) return null;
  return ACCOUNT_IDS.find((id) => id === v || ACCOUNTS[id].name.toLowerCase().replace(/\s+/g, '') === v || (id === 'ctt' && v.includes('ctt'))) ?? null;
}

export const CSV_COLUMNS = [
  'date',
  'type',
  'amount',
  'description',
  'category',
  'subcategory',
  'account',
  'to_account',
  'payment_method',
  'merchant',
  'notes',
  'recurring',
  'recurrence',
] as const;

// Accept common Portuguese headers too, so exports from spreadsheets import without renaming.
const HEADER_ALIASES: Record<string, (typeof CSV_COLUMNS)[number]> = {
  data: 'date',
  tipo: 'type',
  valor: 'amount',
  montante: 'amount',
  descricao: 'description',
  'descrição': 'description',
  categoria: 'category',
  subcategoria: 'subcategory',
  metodo: 'payment_method',
  'método': 'payment_method',
  metodo_pagamento: 'payment_method',
  loja: 'merchant',
  local: 'merchant',
  notas: 'notes',
};

export function importTransactionsCsv(text: string): { imported: number; skipped: number } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { imported: 0, skipped: 0 };
  const header: string[] = rows[0].map((h) => {
    const k = h.trim().toLowerCase();
    return HEADER_ALIASES[k] ?? k;
  });
  const col = (row: string[], name: string) => {
    const i = header.indexOf(name);
    return i >= 0 ? (row[i] ?? '').trim() : '';
  };

  let imported = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const date = parseFlexibleDate(col(row, 'date'));
    const rawAmount = parseDecimal(col(row, 'amount'));
    const description = col(row, 'description') || col(row, 'merchant');
    if (!date || rawAmount == null || rawAmount === 0 || !description) {
      skipped++;
      continue;
    }
    const typeRaw = col(row, 'type').toLowerCase();
    // Rows without a recognised type are imported as purchases; the sign of the amount is ignored.
    let type: TxType = TX_TYPES.includes(typeRaw as TxType) ? (typeRaw as TxType) : 'purchase';
    const account = parseAccount(col(row, 'account')) ?? 'ctt';
    const toAccount = parseAccount(col(row, 'to_account'));
    if (type === 'transfer' && (!toAccount || toAccount === account)) type = 'payment';
    const method = col(row, 'payment_method').toLowerCase();
    const recurrence = col(row, 'recurrence').toLowerCase();
    const recurring = ['1', 'true', 'yes', 'sim'].includes(col(row, 'recurring').toLowerCase()) && ['monthly', 'quarterly', 'yearly'].includes(recurrence);
    upsertTransaction({
      date,
      amount: Math.abs(rawAmount),
      type,
      description,
      categoryId: findOrCreateCategory(col(row, 'category')),
      subcategory: col(row, 'subcategory') || null,
      account,
      toAccount: type === 'transfer' ? toAccount : null,
      paymentMethod: PAYMENT_METHODS.includes(method as PaymentMethod) ? (method as PaymentMethod) : 'other',
      merchant: col(row, 'merchant') || null,
      notes: col(row, 'notes') || null,
      attachment: null,
      recurring,
      recurrence: recurring ? (recurrence as 'monthly' | 'quarterly' | 'yearly') : null,
    });
    imported++;
  }
  return { imported, skipped };
}
