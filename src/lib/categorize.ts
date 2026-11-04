// Category suggestions for new transactions. Pure functions (no I/O) so the form can run them client-side.
// Order of trust: the user's own rules → what they categorised before → a small built-in list of well-known Portuguese names.

export type SuggestKind = 'spending' | 'income' | 'transfer';

export interface RuleLike {
  id: number;
  enabled: boolean;
  text: string;
  account: string | null;
  categoryId: number;
}

export interface CategoryLike {
  id: number;
  key: string | null;
  kind: string;
}

export interface SuggestInput {
  description: string;
  merchant: string;
  account: string;
  kind: SuggestKind;
}

export interface Suggestion {
  categoryId: number;
  source: 'rule' | 'history' | 'keyword';
  /** The text that triggered the suggestion (rule text, past merchant/description or known name). */
  matched: string;
  ruleId?: number;
}

export interface HistoryHints {
  /** normalised merchant / description → category the user most often gave it */
  merchants: Record<string, number>;
  descriptions: Record<string, number>;
}

/** Lowercase, accent-free, punctuation → spaces. "Pingo Doce, Lisboa!" → "pingo doce lisboa". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** True when `needle` occurs in `haystack` as whole words (so "cp" matches "CP Lisboa" but not "capa"). Both already normalised. */
function containsWords(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

/** Rules match as a plain, case/accent-insensitive "contains" over description + merchant. */
export function ruleMatches(rule: Pick<RuleLike, 'text' | 'account'>, tx: { description: string; merchant?: string | null; account: string }): boolean {
  const needle = normalize(rule.text);
  if (!needle) return false;
  if (rule.account && rule.account !== tx.account) return false;
  const hay = normalize(`${tx.description} ${tx.merchant ?? ''}`);
  return hay.includes(needle);
}

/** Well-known names → built-in category key. Matched as whole words, longest name first. */
const KEYWORDS: Record<string, string[]> = {
  food: ['continente', 'pingo doce', 'lidl', 'auchan', 'minipreco', 'mini preco', 'intermarche', 'aldi', 'mercadona', 'supermercado', 'mercearia', 'padaria', 'talho', 'peixaria', 'froiz', 'apolonia', 'spar', 'meu super'],
  restaurants: ["mcdonald's", 'mcdonalds', 'burger king', 'kfc', 'telepizza', 'pizza hut', 'uber eats', 'glovo', 'bolt food', 'restaurante', 'cafe', 'pastelaria', 'starbucks', 'tasca', 'sushi', 'pizzaria', 'vitaminas', 'time out'],
  transport: ['uber', 'bolt', 'cp', 'comboios de portugal', 'metro', 'carris', 'via verde', 'galp', 'repsol', 'cepsa', 'bp', 'combustivel', 'gasolina', 'gasoleo', 'estacionamento', 'taxi', 'flixbus', 'navegante', 'moov'],
  subscriptions: ['netflix', 'spotify', 'disney', 'hbo', 'hbo max', 'prime video', 'youtube premium', 'icloud', 'dazn', 'crunchyroll', 'chatgpt', 'openai', 'adobe', 'microsoft 365', 'apple music', 'audible', 'patreon'],
  gaming: ['steam', 'playstation', 'psn', 'xbox', 'nintendo', 'epic games', 'blizzard', 'riot games', 'gamivo', 'g2a'],
  health: ['farmacia', 'wells', 'clinica', 'hospital', 'medico', 'dentista', 'analises', 'cuf', 'luz saude'],
  gym: ['ginasio', 'fitness hut', 'holmes place', 'solinca'],
  muay_thai: ['muay thai', 'kickboxing'],
  tech: ['worten', 'fnac', 'pcdiga', 'pc diga', 'amazon', 'apple store', 'aliexpress', 'globaldata', 'chip7'],
  clothing: ['zara', 'h&m', 'primark', 'pull&bear', 'bershka', 'decathlon', 'nike', 'adidas', 'sport zone'],
  travel: ['ryanair', 'easyjet', 'tap air portugal', 'booking', 'airbnb', 'hotel', 'hostel', 'trip.com'],
  home: ['ikea', 'leroy merlin', 'edp', 'endesa', 'goldenergy', 'epal', 'agua', 'renda', 'condominio', 'meo', 'nos', 'vodafone', 'nowo', 'conforama', 'aki'],
  personal_care: ['cabeleireiro', 'barbeiro', 'perfumaria', 'sephora', 'douglas'],
  investment: ['trading 212', 'trading212'],
  savings: ['trade republic'],
  salary: ['salario', 'vencimento', 'ordenado'],
};

const ENTRIES: [string, string][] = Object.entries(KEYWORDS)
  .flatMap(([key, words]) => words.map((w) => [normalize(w), key] as [string, string]))
  .sort((a, b) => b[0].length - a[0].length);

/** A category fits the kind of transaction being logged (a salary is never suggested for a purchase). */
export function categoryFitsKind(category: Pick<CategoryLike, 'kind'>, kind: SuggestKind): boolean {
  if (kind === 'spending') return category.kind === 'expense';
  if (kind === 'income') return category.kind === 'income' || category.kind === 'salary';
  return category.kind === 'investment' || category.kind === 'savings';
}

export function suggestCategory(
  input: SuggestInput,
  ctx: { rules: RuleLike[]; history: HistoryHints; categories: CategoryLike[] },
): Suggestion | null {
  const description = input.description.trim();
  const merchant = input.merchant.trim();
  if (!description && !merchant) return null;
  const known = new Map(ctx.categories.map((c) => [c.id, c]));

  // 1. The user's rules, in their chosen order (first match wins).
  for (const rule of ctx.rules) {
    if (!rule.enabled || !known.has(rule.categoryId)) continue;
    if (ruleMatches(rule, { description, merchant, account: input.account })) {
      return { categoryId: rule.categoryId, source: 'rule', matched: rule.text, ruleId: rule.id };
    }
  }

  const nAll = normalize(`${description} ${merchant}`);

  // 2. History: the longest previously used merchant/description contained in what is being typed.
  let best: { key: string; id: number } | null = null;
  for (const table of [ctx.history.merchants, ctx.history.descriptions]) {
    for (const [key, id] of Object.entries(table)) {
      const cat = known.get(id);
      if (!cat || !categoryFitsKind(cat, input.kind) || key.length < 3) continue;
      if (containsWords(nAll, key) && (!best || key.length > best.key.length)) best = { key, id };
    }
  }
  if (best) return { categoryId: best.id, source: 'history', matched: best.key };

  // 3. Well-known names.
  const byKey = new Map(ctx.categories.filter((c) => c.key).map((c) => [c.key as string, c]));
  for (const [word, key] of ENTRIES) {
    const cat = byKey.get(key);
    if (cat && categoryFitsKind(cat, input.kind) && containsWords(nAll, word)) return { categoryId: cat.id, source: 'keyword', matched: word };
  }
  return null;
}
