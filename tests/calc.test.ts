import { describe, expect, it } from 'vitest';
import { goalProgress, grossMonthlyInterest, milestones, savingsRate, simulateEtf, simulateHouseSavings } from '@/lib/calc';

describe('tiered interest (TANB 3% até 50.000 €, 2,5% acima)', () => {
  it('applies 3% to balances below the limit', () => {
    expect(grossMonthlyInterest(12_000)).toBeCloseTo((12_000 * 0.03) / 12, 10);
  });

  it('splits the balance across tiers above the limit', () => {
    const expected = (50_000 * 0.03 + 10_000 * 0.025) / 12;
    expect(grossMonthlyInterest(60_000)).toBeCloseTo(expected, 10);
  });

  it('earns nothing on zero or negative balances', () => {
    expect(grossMonthlyInterest(0)).toBe(0);
    expect(grossMonthlyInterest(-100)).toBe(0);
  });
});

describe('house down payment simulation (monthly compounding, 28% IRS)', () => {
  const base = {
    housePrice: 200_000,
    downPaymentPct: 0.1,
    purchaseCostsPct: 0.07,
    monthlyContribution: 0,
    annualBonus: 0,
    initialBalance: 10_000,
    years: 1,
  };

  it('compounds net interest monthly', () => {
    const r = simulateHouseSavings(base);
    const monthlyNet = (0.03 / 12) * 0.72;
    const expected = 10_000 * Math.pow(1 + monthlyNet, 12);
    expect(r.points.at(-1)!.balance).toBeCloseTo(expected, 2);
    expect(r.points.at(-1)!.interest).toBeCloseTo(expected - 10_000, 2);
    expect(r.points.at(-1)!.deposited).toBe(10_000);
  });

  it('keeps deposited capital, net interest and total consistent', () => {
    const r = simulateHouseSavings({ ...base, monthlyContribution: 600, annualBonus: 2500, initialBalance: 2800, years: 10 });
    for (const p of r.points) expect(p.balance).toBeCloseTo(p.deposited + p.interest, 1);
    const m = milestones(r.points, [3, 5, 7, 10]);
    expect(m.map((x) => x.years)).toEqual([3, 5, 7, 10]);
    // 10 years: 2.800 + 120 × 600 + 10 × 2.500
    expect(m[3].deposited).toBe(2800 + 120 * 600 + 10 * 2500);
    expect(m[3].interest).toBeGreaterThan(0);
  });

  it('computes target and months to reach it', () => {
    const r = simulateHouseSavings({ ...base, initialBalance: 0, monthlyContribution: 1000, years: 5 });
    expect(r.target).toBe(34_000);
    expect(r.monthsToTarget).toBeGreaterThan(30);
    expect(r.monthsToTarget).toBeLessThanOrEqual(34);
  });

  it('applies the lower tier rate above 50.000 €', () => {
    const r = simulateHouseSavings({ ...base, initialBalance: 100_000, years: 1, taxRate: 0 });
    const firstMonth = r.points[1].interest;
    expect(firstMonth).toBeCloseTo((50_000 * 0.03 + 50_000 * 0.025) / 12, 2);
  });
});

describe('ETF projection', () => {
  it('with 0% return equals the sum of contributions', () => {
    const p = simulateEtf({ monthlyContribution: 500, currentValue: 9242.3, annualReturn: 0, years: 2 });
    expect(p.at(-1)!.value).toBeCloseTo(9242.3 + 24 * 500, 2);
    expect(p.at(-1)!.contributed).toBeCloseTo(9242.3 + 24 * 500, 2);
  });

  it('grows a lump sum by the annual rate after 12 months', () => {
    const p = simulateEtf({ monthlyContribution: 0, currentValue: 1000, annualReturn: 0.07, years: 1 });
    expect(p.at(-1)!.value).toBeCloseTo(1070, 2);
  });
});

describe('savings rate', () => {
  it('divides savings by income', () => {
    expect(savingsRate(1100, 1750)).toBeCloseTo(0.62857, 4);
  });
  it('is 0 when income is 0', () => {
    expect(savingsRate(100, 0)).toBe(0);
  });
});

describe('goal progress', () => {
  it('reports percentage, remaining and ETA', () => {
    const p = goalProgress({ target: 6000, current: 2800, monthly: 300, targetDate: '2027-06' }, '2026-11');
    expect(p.pct).toBeCloseTo(2800 / 6000, 6);
    expect(p.remaining).toBe(3200);
    expect(p.monthsLeft).toBe(11);
    expect(p.projectedMonth).toBe('2027-10');
    expect(p.requiredMonthly).toBeCloseTo(3200 / 7, 2);
    expect(p.onTrack).toBe(false);
  });

  it('caps at 100% when reached', () => {
    const p = goalProgress({ target: 1000, current: 1500, monthly: 0, targetDate: null }, '2026-11');
    expect(p.pct).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.monthsLeft).toBe(0);
  });

  it('has no ETA without a monthly contribution', () => {
    const p = goalProgress({ target: 1000, current: 0, monthly: 0, targetDate: null }, '2026-11');
    expect(p.monthsLeft).toBeNull();
    expect(p.projectedMonth).toBeNull();
  });
});

