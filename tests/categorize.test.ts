import { describe, expect, it } from 'vitest';
import { normalize, ruleMatches, suggestCategory, type CategoryLike, type RuleLike } from '@/lib/categorize';

const cats: CategoryLike[] = [
  { id: 1, key: 'food', kind: 'expense' },
  { id: 2, key: 'transport', kind: 'expense' },
  { id: 3, key: 'subscriptions', kind: 'expense' },
  { id: 4, key: 'gaming', kind: 'expense' },
  { id: 5, key: 'salary', kind: 'salary' },
  { id: 6, key: 'restaurants', kind: 'expense' },
  { id: 7, key: null, kind: 'expense' },
];
const none = { merchants: {}, descriptions: {} };
const input = (description: string, over: Partial<{ merchant: string; account: string; kind: 'spending' | 'income' | 'transfer' }> = {}) => ({
  description,
  merchant: '',
  account: 'ctt',
  kind: 'spending' as const,
  ...over,
});

describe('normalize', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(normalize('  Pingo Doce, LISBOA! ')).toBe('pingo doce lisboa');
    expect(normalize('Café São João')).toBe('cafe sao joao');
  });
});

describe('suggestions from well-known names', () => {
  const s = (d: string, extra = {}) => suggestCategory(input(d, extra), { rules: [], history: none, categories: cats })?.categoryId;
  it('maps common Portuguese stores and services', () => {
    expect(s('Continente')).toBe(1);
    expect(s('Pingo Doce Alvalade')).toBe(1);
    expect(s('LIDL')).toBe(1);
    expect(s('Uber')).toBe(2);
    expect(s('Bolt')).toBe(2);
    expect(s('CP Lisboa-Porto')).toBe(2);
    expect(s('Netflix')).toBe(3);
    expect(s('Spotify Premium')).toBe(3);
    expect(s('Steam')).toBe(4);
  });
  it('prefers the longest name ("Bolt Food" is a restaurant, not transport)', () => {
    expect(s('Bolt Food')).toBe(6);
  });
  it('matches whole words only', () => {
    expect(s('capa de telemóvel')).toBeUndefined();
  });
  it('never suggests a spending category for income, nor a salary for a purchase', () => {
    expect(s('Salário Novembro', { kind: 'income' })).toBe(5);
    expect(s('Salário Novembro')).toBeUndefined();
  });
  it('returns nothing for unknown or empty text', () => {
    expect(s('xyzzy')).toBeUndefined();
    expect(s('   ')).toBeUndefined();
  });
});

describe('suggestions from history', () => {
  it('uses what the user categorised before, ahead of the built-in list', () => {
    const r = suggestCategory(input('Continente Bom Dia', { merchant: 'Continente' }), { rules: [], history: { merchants: { continente: 6 }, descriptions: {} }, categories: cats });
    expect(r).toMatchObject({ categoryId: 6, source: 'history' });
  });
  it('ignores history pointing at a category that does not fit the transaction kind', () => {
    const r = suggestCategory(input('Padaria Central', { kind: 'income' }), { rules: [], history: { merchants: {}, descriptions: { 'padaria central': 1 } }, categories: cats });
    expect(r).toBeNull();
  });
});

describe('user rules', () => {
  const rule = (over: Partial<RuleLike>): RuleLike => ({ id: 1, enabled: true, text: 'netflix', account: null, categoryId: 4, ...over });
  const ctx = (rules: RuleLike[]) => ({ rules, history: none, categories: cats });

  it('beat history and built-in names', () => {
    expect(suggestCategory(input('Netflix'), ctx([rule({})]))).toMatchObject({ categoryId: 4, source: 'rule', ruleId: 1 });
  });
  it('first enabled rule wins; disabled rules are skipped', () => {
    const rules = [rule({ id: 1, enabled: false, categoryId: 1 }), rule({ id: 2, categoryId: 2 }), rule({ id: 3, categoryId: 4 })];
    expect(suggestCategory(input('Netflix'), ctx(rules))?.categoryId).toBe(2);
  });
  it('can require an account', () => {
    const r = [rule({ account: 'revolut' })];
    expect(suggestCategory(input('Netflix', { account: 'ctt' }), ctx(r))?.source).toBe('keyword');
    expect(suggestCategory(input('Netflix', { account: 'revolut' }), ctx(r))?.source).toBe('rule');
  });
  it('ignores rules whose category no longer exists', () => {
    expect(suggestCategory(input('Netflix'), ctx([rule({ categoryId: 99 })]))?.source).toBe('keyword');
  });
  it('matches the merchant too, ignoring case and accents', () => {
    expect(ruleMatches({ text: 'CAFÉ', account: null }, { description: 'bica', merchant: 'Café Central', account: 'ctt' })).toBe(true);
    expect(ruleMatches({ text: '', account: null }, { description: 'x', account: 'ctt' })).toBe(false);
  });
});
