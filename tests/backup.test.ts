import { describe, expect, it } from 'vitest';
import { BACKUP_FORMAT, emptyData, planRestore, planTotals, validateBackup, type BackupData, type BTransaction } from '@/lib/backup-format';
import { parseTransactionsCsv } from '@/lib/tx-csv';

const tx = (over: Partial<BTransaction> = {}): BTransaction => ({
  date: '2026-11-02', amount: 12.5, type: 'purchase', description: 'Lidl', category: 'food', subcategory: null, account: 'ctt', toAccount: null,
  paymentMethod: 'card', merchant: null, notes: null, recurring: false, recurrence: null, ...over,
});
const cat = (over = {}) => ({ ref: 'food', key: 'food', name: 'food', color: '#22c55e', kind: 'expense', monthlyBudget: null, builtin: true, ...over });
const data = (over: Partial<BackupData> = {}): BackupData => ({ ...emptyData(), ...over });
const wrap = (d: unknown, version = 1) => JSON.stringify({ format: BACKUP_FORMAT, version, exportedAt: '2026-11-04T10:00:00Z', period: null, data: d });

describe('validateBackup', () => {
  it('rejects things that are not a NestFund backup', () => {
    expect(validateBackup('not json')).toEqual({ ok: false, error: 'notJson' });
    expect(validateBackup('{"hello":1}')).toEqual({ ok: false, error: 'notBackup' });
    expect(validateBackup(wrap({}, 99))).toEqual({ ok: false, error: 'newerVersion' });
    expect(validateBackup(wrap({}))).toEqual({ ok: false, error: 'empty' });
  });

  it('keeps valid records and reports invalid ones instead of guessing', () => {
    const r = validateBackup(
      wrap({
        transactions: [tx(), { ...tx(), amount: -3 }, { ...tx(), date: '2026-13-45' }, { ...tx(), type: 'gift' }, { ...tx(), type: 'transfer', toAccount: 'ctt' }, 'junk'],
        goals: [{ kind: 'house', name: 'Casa', target: 20000 }, { kind: 'house', name: '', target: 1 }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.data.transactions).toHaveLength(1);
    expect(r.file.data.goals).toHaveLength(1);
    expect(r.invalid.map((i) => `${i.section}#${i.index}`)).toEqual(['transactions#1', 'transactions#2', 'transactions#3', 'transactions#4', 'transactions#5', 'goals#1']);
  });

  it('never reads a Trading 212 key even if one is smuggled into the file', () => {
    const r = validateBackup(wrap({ goals: [{ kind: 'house', name: 'Casa', target: 1 }], t212Key: 'secret' }).replace('"data"', '"apiKey":"secret","data"'));
    expect(r.ok && JSON.stringify(r.file)).not.toContain('secret');
  });
});

describe('planRestore', () => {
  it('importing the same backup twice changes nothing the second time', () => {
    const file = data({
      categories: [cat()],
      transactions: [tx(), tx({ description: 'Pingo Doce', amount: 30 })],
      goals: [{ kind: 'house', name: 'Casa', target: 20000, current: 0, monthly: 0, targetDate: null, color: '#ffffff', account: null }],
    });
    const first = planRestore(file, emptyData());
    expect(planTotals(first)).toMatchObject({ create: 4, update: 0 });
    const second = planRestore(file, file);
    expect(planTotals(second)).toEqual({ create: 0, update: 0, ignore: 4 });
  });

  it('keeps genuine repeated lines but only as many as the database lacks', () => {
    const plan = planRestore(data({ transactions: [tx(), tx(), tx()] }), data({ transactions: [tx()] }));
    expect(plan.transactions.create).toHaveLength(2);
    expect(plan.transactions.ignore).toHaveLength(1);
  });

  it('matches transactions by what they are, ignoring case and spacing of the description', () => {
    const plan = planRestore(data({ transactions: [tx({ description: ' LIDL ' })] }), data({ transactions: [tx()] }));
    expect(plan.transactions.ignore).toHaveLength(1);
    expect(plan.transactions.create).toHaveLength(0);
  });

  it('never overwrites an existing transaction, even if the file differs', () => {
    const plan = planRestore(data({ transactions: [tx({ category: null, notes: 'old' })] }), data({ transactions: [tx({ notes: 'edited today' })] }));
    expect(plan.transactions.update).toEqual([]);
    expect(plan.transactions.ignore).toHaveLength(1);
  });

  it('updates categories, goals and month budgets only where they differ, and says which fields', () => {
    const goal = { kind: 'house', name: 'Casa', target: 20000, current: 0, monthly: 100, targetDate: null, color: '#ffffff', account: 'traderepublic' };
    const month = { month: '2026-11', income: 1750, extraIncome: 0, mealCard: 200, notes: null, items: [] };
    const plan = planRestore(
      data({ categories: [cat({ monthlyBudget: 180 })], goals: [goal], monthBudgets: [month] }),
      data({ categories: [cat({ monthlyBudget: null })], goals: [{ ...goal, monthly: 50 }], monthBudgets: [month] }),
    );
    expect(plan.categories.update[0].changes).toEqual(['monthlyBudget']);
    expect(plan.goals.update[0].changes).toEqual(['monthly']);
    expect(plan.monthBudgets.ignore).toHaveLength(1);
  });

  it('adds only the missing Trading 212 days and never changes existing ones', () => {
    const day = (date: string, v: number) => ({ date, totalValue: v, invested: 1, cash: 0, unrealized: 0, growthPct: 0, currency: 'EUR' });
    const plan = planRestore(data({ t212History: [day('2026-11-01', 100), day('2026-11-02', 200)] }), data({ t212History: [day('2026-11-01', 999)] }));
    expect(plan.t212History.create.map((d) => d.date)).toEqual(['2026-11-02']);
    expect(plan.t212History.ignore).toHaveLength(1);
    expect(plan.t212History.update).toEqual([]);
  });

  it('warns about categories that exist nowhere, and plans no deletions', () => {
    const plan = planRestore(data({ transactions: [tx({ category: 'custom:mystery' })] }), data({ categories: [cat()] }));
    expect(plan.unknownCategories).toEqual(['custom:mystery']);
    expect(Object.keys(plan)).not.toContain('delete');
  });

  it('plans profile changes field by field', () => {
    const plan = planRestore(data({ profile: { defaultIncome: 1800, mealCard: 200 } }), data({ profile: { defaultIncome: 1750, mealCard: 200 } }));
    expect(plan.profile?.changes).toEqual(['defaultIncome']);
    expect(planRestore(data({ profile: { mealCard: 200 } }), data({ profile: { mealCard: 200 } })).profile).toBeNull();
  });
});

describe('transactions CSV', () => {
  const resolve = (raw: string) => (raw ? raw.toLowerCase() : null);
  it('parses valid rows and reports each invalid one with its line and reason', () => {
    const csv = [
      'date,type,amount,description,category,account',
      '2026-11-02,purchase,12.50,Lidl,food,ctt',
      '03/11/2026,,"7,90",Café,,revolut',
      'nope,purchase,5,X,,ctt',
      '2026-11-04,purchase,0,Zero,,ctt',
      '2026-11-04,gift,5,Weird,,ctt',
      '2026-11-04,purchase,5,Bank,,narnia',
      '2026-11-04,transfer,50,ETF,,ctt',
      '',
    ].join('\n');
    const r = parseTransactionsCsv(csv, resolve);
    expect(r.hasHeader).toBe(true);
    expect(r.transactions.map((t) => [t.date, t.amount, t.account])).toEqual([['2026-11-02', 12.5, 'ctt'], ['2026-11-03', 7.9, 'revolut']]);
    expect(r.invalid).toEqual([
      { line: 4, reason: 'date' }, { line: 5, reason: 'amount' }, { line: 6, reason: 'type' }, { line: 7, reason: 'account' }, { line: 8, reason: 'transfer' },
    ]);
  });
  it('skips identical lines repeated inside the same CSV, so a double-pasted export never duplicates', () => {
    const r = parseTransactionsCsv(['date,amount,description', '2026-11-02,5,Pizza', '2026-11-02,5.00,pizza', '2026-11-03,5,Pizza'].join('\n'), resolve);
    expect(r.transactions).toHaveLength(2);
    expect(r.invalid).toEqual([{ line: 3, reason: 'repeated' }]);
  });
  it('accepts Portuguese headers and semicolons, and refuses a file with no recognisable header', () => {
    const r = parseTransactionsCsv('data;valor;descrição\n2026-11-02;3,50;Pão', resolve);
    expect(r.transactions).toHaveLength(1);
    expect(parseTransactionsCsv('foo,bar\n1,2', resolve).hasHeader).toBe(false);
  });
  it('a CSV already in the database is entirely ignored', () => {
    const csv = 'date,amount,description,category\n2026-11-02,12.50,Lidl,food';
    const rows = parseTransactionsCsv(csv, (r) => r || null).transactions;
    const plan = planRestore(data({ transactions: rows }), data({ transactions: [tx()] }));
    expect(planTotals(plan)).toEqual({ create: 0, update: 0, ignore: 1 });
  });
});
