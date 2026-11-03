import type Database from 'better-sqlite3';
import { addMonths, currentMonth, daysInMonth, isActiveInMonth, todayISO } from './dates';
import type { Profile } from './types';

const c = (euros: number) => Math.round(euros * 100);

export const DEFAULT_PROFILE: Profile = {
  incomeMin: 1750,
  incomeMax: 1800,
  defaultIncome: 1750,
  mealCard: 200,
  transportAllowance: 40,
  annualBonus: 2500,
};

// key, color, kind, monthly budget (€) — names are translated in the UI from `categories.<key>`.
const CATEGORIES: [string, string, string, number | null][] = [
  ['food', '#22c55e', 'expense', 180],
  ['restaurants', '#f97316', 'expense', 60],
  ['transport', '#0ea5e9', 'expense', 45],
  ['home', '#a855f7', 'expense', null],
  ['health', '#ef4444', 'expense', 20],
  ['gym', '#14b8a6', 'expense', null],
  ['muay_thai', '#dc2626', 'expense', null],
  ['subscriptions', '#6366f1', 'expense', null],
  ['tech', '#3b82f6', 'expense', 30],
  ['gaming', '#8b5cf6', 'expense', 40],
  ['collectibles', '#eab308', 'expense', 40],
  ['cosplay', '#ec4899', 'expense', 50],
  ['clothing', '#f43f5e', 'expense', 40],
  ['personal_care', '#06b6d4', 'expense', 20],
  ['travel', '#84cc16', 'expense', null],
  ['leisure', '#f59e0b', 'expense', 45],
  ['investment', '#10b981', 'investment', null],
  ['savings', '#059669', 'savings', null],
  ['salary', '#16a34a', 'salary', null],
  ['income', '#4ade80', 'income', null],
  ['other', '#71717a', 'expense', null],
];

export function seedDatabase(db: Database.Database, { sample }: { sample: boolean }) {
  const setSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  setSetting.run('profile', JSON.stringify(DEFAULT_PROFILE));

  const insertCat = db.prepare('INSERT INTO categories (key, name, color, kind, monthly_budget, builtin, sort) VALUES (?, ?, ?, ?, ?, 1, ?)');
  const catId: Record<string, number> = {};
  CATEGORIES.forEach(([key, color, kind, budget], i) => {
    catId[key] = Number(insertCat.run(key, key, color, kind, budget == null ? null : c(budget), i).lastInsertRowid);
  });

  const insertItem = db.prepare(
    'INSERT INTO budget_items (name, kind, amount, category_id, account, start_month, end_month, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  );
  const now = currentMonth();
  // Muay Thai starts next January (this January if we are in January).
  const muayThaiStart = `${Number(now.slice(0, 4)) + (now.slice(5) === '01' ? 0 : 1)}-01`;
  const items: [string, string, number, string, string, string | null][] = [
    ['Ginásio', 'fixed', 39.9, 'gym', 'ctt', null],
    ['Dados móveis', 'fixed', 7, 'subscriptions', 'ctt', null],
    ['Revolut Premium', 'fixed', 10.39, 'subscriptions', 'revolut', null],
    ['Muay Thai', 'fixed', 37, 'muay_thai', 'ctt', muayThaiStart],
    ['Lazer (Revolut)', 'leisure', 275, 'leisure', 'revolut', null],
    ['ETF (Trading 212)', 'etf', 500, 'investment', 'trading212', null],
    ['Poupança casa / reserva (Trade Republic)', 'savings', 600, 'savings', 'traderepublic', null],
  ];
  items.forEach(([name, kind, amount, cat, account, start], i) => insertItem.run(name, kind, c(amount), catId[cat], account, start, null, i));

  // Goals linked to an account take their progress from its balance; Trade Republic fills the emergency fund first.
  const insertGoal = db.prepare('INSERT INTO goals (kind, name, target, current, monthly, target_date, color, account, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const year = Number(now.slice(0, 4));
  insertGoal.run('emergency', 'Reserva de emergência', c(6000), 0, c(300), `${year + 1}-06`, '#0ea5e9', 'traderepublic', 0);
  insertGoal.run('house', 'Entrada para casa', c(42500), 0, c(300), `${year + 5}-12`, '#a855f7', 'traderepublic', 1);
  insertGoal.run('fire', 'Independência financeira', c(500000), 0, c(500), null, '#10b981', 'trading212', 2);

  if (sample) seedSampleData(db, catId);

  setSetting.run('seeded', todayISO());
}

function seedSampleData(db: Database.Database, catId: Record<string, number>) {
  const now = currentMonth();
  const today = todayISO();
  const templateItems = db.prepare('SELECT * FROM budget_items ORDER BY sort').all() as Record<string, never>[];

  // Six months of budget history, alternating 1.750 € / 1.800 € net salary.
  const salaryFor = (offset: number) => (offset % 2 === 0 ? 1750 : 1800);
  const insertMonth = db.prepare('INSERT INTO month_budgets (month, income, extra_income, meal_card, items) VALUES (?, ?, 0, ?, ?)');
  for (let i = -5; i <= 0; i++) {
    const month = addMonths(now, i);
    const items = templateItems
      .filter((it) => isActiveInMonth({ startMonth: it.start_month, endMonth: it.end_month }, month))
      .map((it) => ({
        id: it.id,
        name: it.name,
        kind: it.kind,
        amount: (it.amount as number) / 100,
        categoryId: it.category_id,
        account: it.account,
        startMonth: it.start_month,
        endMonth: it.end_month,
      }));
    insertMonth.run(month, c(salaryFor(i)), c(200), JSON.stringify(items));
  }

  // Balance check-ins. Trading 212: 9.242,30 € value with 8.255,97 € invested today; Trade Republic: 2.800 € today.
  const insertSnap = db.prepare('INSERT INTO snapshots (date, account, value, invested, notes) VALUES (?, ?, ?, ?, ?)');
  const etfValues = [6380.1, 6990.8, 7480.15, 8105.2, 8610.4, 9242.3];
  const trValues = [0, 520, 1060, 1640, 2215, 2800];
  for (let i = 0; i < 6; i++) {
    const month = addMonths(now, i - 5);
    const date = i === 5 ? today : `${month}-${daysInMonth(month)}`;
    insertSnap.run(date, 'trading212', c(etfValues[i]), c(8255.97 - (5 - i) * 500), null);
    if (trValues[i] > 0) insertSnap.run(date, 'traderepublic', c(trValues[i]), c(trValues[i]), null);
  }
  // Day-to-day accounts start from a balance three months ago; movements since then are logged below.
  const opening = addMonths(now, -3);
  const openingDate = `${opening}-${daysInMonth(opening)}`;
  insertSnap.run(openingDate, 'ctt', c(1350), c(1350), null);
  insertSnap.run(openingDate, 'revolut', c(80), c(80), null);
  insertSnap.run(openingDate, 'meal_card', c(15), c(15), null);
  insertSnap.run(openingDate, 'cash', c(60), c(60), null);

  const insertTx = db.prepare(
    `INSERT INTO transactions (date, amount, type, description, category_id, subcategory, account, to_account, payment_method, merchant, recurring, recurrence, last_generated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const add = (date: string, amount: number, type: string, desc: string, cat: string | null, account: string, method: string, merchant: string | null, extra: { sub?: string; to?: string; recurrence?: string } = {}) => {
    if (date > today) return;
    insertTx.run(date, c(amount), type, desc, cat ? catId[cat] : null, extra.sub ?? null, account, extra.to ?? null, method, merchant, extra.recurrence ? 1 : 0, extra.recurrence ?? null, extra.recurrence ? date : null);
  };

  // Recurring series started two months ago; later occurrences are generated automatically.
  const first = addMonths(now, -2);
  add(`${first}-02`, 275, 'transfer', 'Transferência para lazer', 'leisure', 'ctt', 'transfer', null, { to: 'revolut', recurrence: 'monthly' });
  add(`${first}-02`, 500, 'transfer', 'Investimento mensal ETF', 'investment', 'ctt', 'transfer', 'Trading 212', { to: 'trading212', recurrence: 'monthly' });
  add(`${first}-02`, 600, 'transfer', 'Poupança casa / reserva', 'savings', 'ctt', 'transfer', 'Trade Republic', { to: 'traderepublic', recurrence: 'monthly' });
  add(`${first}-03`, 39.9, 'payment', 'Ginásio', 'gym', 'ctt', 'direct_debit', 'Ginásio', { recurrence: 'monthly' });
  add(`${first}-08`, 7, 'payment', 'Dados móveis', 'subscriptions', 'ctt', 'direct_debit', null, { recurrence: 'monthly' });
  add(`${first}-12`, 10.39, 'payment', 'Revolut Premium', 'subscriptions', 'revolut', 'direct_debit', 'Revolut', { recurrence: 'monthly' });
  add(`${first}-01`, 40, 'payment', 'Passe Navegante', 'transport', 'ctt', 'mbway', 'Navegante', { recurrence: 'monthly' });

  type Row = [day: number, amount: number, type: string, desc: string, cat: string, account: string, method: string, merchant: string, sub?: string];
  const perMonth: Row[] = [
    [2, 38.45, 'purchase', 'Compras da semana', 'food', 'meal_card', 'card', 'Continente', 'Supermercado'],
    [3, 9.8, 'purchase', 'Almoço', 'restaurants', 'meal_card', 'card', 'Tasca do Zé'],
    [6, 19.99, 'purchase', 'Jogo indie', 'gaming', 'revolut', 'card', 'Steam'],
    [9, 42.1, 'purchase', 'Compras da semana', 'food', 'meal_card', 'card', 'Pingo Doce', 'Supermercado'],
    [11, 23.5, 'expense', 'Jantar com amigos', 'restaurants', 'revolut', 'card', 'Restaurante O Pátio'],
    [12, 8.75, 'purchase', 'Farmácia', 'health', 'ctt', 'mbway', 'Farmácia Central'],
    [14, 32.5, 'purchase', 'Tecido e espuma EVA', 'cosplay', 'revolut', 'card', 'Retrosaria', 'Materiais'],
    [16, 36.9, 'purchase', 'Compras da semana', 'food', 'meal_card', 'card', 'Lidl', 'Supermercado'],
    [18, 7.5, 'expense', 'Cinema', 'leisure', 'revolut', 'card', 'Cinema'],
    [19, 12.4, 'purchase', 'Champô e gel', 'personal_care', 'ctt', 'card', 'Wells'],
    [21, 44.9, 'purchase', 'Figura colecionável', 'collectibles', 'revolut', 'card', 'Worten', 'Figuras'],
    [23, 39.95, 'purchase', 'Casaco', 'clothing', 'revolut', 'card', 'Zara'],
    [24, 31.2, 'purchase', 'Compras da semana', 'food', 'meal_card', 'card', 'Continente', 'Supermercado'],
    [26, 14.99, 'purchase', 'Cabo USB-C', 'tech', 'revolut', 'card', 'Amazon', 'Acessórios'],
    [27, 12, 'expense', 'Café e bolos', 'restaurants', 'cash', 'cash', 'Pastelaria'],
  ];
  for (let i = -2; i <= 0; i++) {
    const month = addMonths(now, i);
    add(`${month}-01`, salaryFor(i), 'income', 'Ordenado', 'salary', 'ctt', 'transfer', null);
    add(`${month}-01`, 200, 'income', 'Carregamento cartão de refeição', 'income', 'meal_card', 'transfer', null);
    for (const [day, amount, type, desc, cat, account, method, merchant, sub] of perMonth) {
      add(`${month}-${String(day).padStart(2, '0')}`, amount, type, desc, cat, account, method, merchant, { sub });
    }
  }
  add(`${addMonths(now, -1)}-15`, 25, 'income', 'Venda no Vinted', 'income', 'revolut', 'transfer', 'Vinted');
}
