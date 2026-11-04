import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INTEREST_CONFIG as CFG,
  addDays,
  baseOn,
  buildDeltas,
  creditDateFor,
  dailyAccruals,
  dailyGross,
  interestOverview,
  monthEnd,
  monthStatement,
  netOfTax,
  type BalanceDelta,
} from '@/lib/interest';

const move = (date: string, amount: number): BalanceDelta => ({ date, amount, kind: 'move' });
const credit = (date: string, amount: number): BalanceDelta => ({ date, amount, kind: 'credit' });
const close = (a: number, b: number, digits = 4) => expect(a).toBeCloseTo(b, digits);

describe('the real Trade Republic figures', () => {
  it('daily interest on 2.900,61 € at 3 % gross: 0,2384 € gross, 0,1717 € after 28 % IRS', () => {
    close(dailyGross(2900.61, CFG), 0.2384);
    close(netOfTax(dailyGross(2900.61, CFG), CFG), 0.1717);
  });

  it('daily interest after the 55,10 € deposit (2.955,71 €): 0,2429 € gross, 0,1749 € net', () => {
    close(dailyGross(2955.71, CFG), 0.2429);
    close(netOfTax(dailyGross(2955.71, CFG), CFG), 0.1749);
  });

  it('27 days on 2.900,61 €: 6,44 € gross, 1,80 € IRS, 4,64 € net (not 0,24 € for the whole period)', () => {
    // Deposited on 3 Nov; from 4 Nov to 30 Nov are exactly the 27 days Trade Republic announces until 1 Dec.
    const days = dailyAccruals([move('2026-11-03', 2900.61)], '2026-11-04', '2026-11-30', CFG);
    expect(days).toHaveLength(27);
    const gross = days.reduce((s, d) => s + d.gross, 0);
    close(gross, 6.437, 3);
    const st = monthStatement([move('2026-11-03', 2900.61)], '2026-11', CFG);
    expect(st).toMatchObject({ gross: 6.44, tax: 1.8, net: 4.64, creditDate: '2026-12-01' });
    expect(st.gross).not.toBe(0.24);
  });

  it('the whole scenario: deposit on 3 Nov, +55,10 € on 4 Nov (earns from 5 Nov)', () => {
    const deltas = [move('2026-11-03', 2900.61), move('2026-11-04', 55.1)];
    // Today (4 Nov) only 2.900,61 € earns, exactly what the Trade Republic app shows: ~0,24 €/day.
    expect(baseOn(deltas, '2026-11-04', CFG)).toBe(2900.61);
    expect(baseOn(deltas, '2026-11-05', CFG)).toBe(2955.71);
    const o = interestOverview(deltas, '2026-11-04', CFG);
    close(o.dailyGrossToday, 0.2384);
    close(o.dailyNetToday, 0.1717);
    close(o.dailyGrossTomorrow, 0.2429);
    close(o.dailyNetTomorrow, 0.1749);
    expect(o.daysToCredit).toBe(27);
    expect(o.creditDate).toBe('2026-12-01');
    expect(o.remainingDays).toBe(27);
    expect(o.accruedGross).toBe(0.24); // one day so far (4 Nov)
    // 1 day on 2.900,61 + 26 days on 2.955,71 = 6,5547 € gross -> 6,55 gross, 1,83 IRS, 4,72 net
    expect(o.monthGross).toBe(6.55);
    expect(o.monthTax).toBe(1.83);
    expect(o.monthNet).toBe(4.72);
  });
});

describe('daily accrual, monthly credit', () => {
  it('uses a 365-day year in every month, leap years included', () => {
    const feb = monthStatement([move('2027-12-31', 10_000)], '2028-02', CFG); // 29 days in 2028
    expect(feb.days).toBe(29);
    expect(feb.gross).toBe(round(10_000 * 0.03 * (29 / 365)));
    const jan = monthStatement([move('2027-12-31', 10_000)], '2028-01', CFG);
    expect(jan.gross).toBe(round(10_000 * 0.03 * (31 / 365)));
  });

  it('does not earn interest on interest that has not been credited yet', () => {
    const deltas = [move('2026-11-03', 2900.61)];
    const days = dailyAccruals(deltas, '2026-11-04', '2026-11-30', CFG);
    // The base never grows during the month: every day earns on the same 2.900,61 €.
    expect(new Set(days.map((d) => d.base))).toEqual(new Set([2900.61]));
  });

  it('credits the net interest on the 1st and earns on it from then on', () => {
    const nov = monthStatement([move('2026-11-03', 2900.61)], '2026-11', CFG);
    const deltas = [move('2026-11-03', 2900.61), credit(nov.creditDate, nov.net)];
    expect(baseOn(deltas, '2026-11-30', CFG)).toBe(2900.61);
    close(baseOn(deltas, '2026-12-01', CFG), 2900.61 + 4.64, 2);
    const dec = monthStatement(deltas, '2026-12', CFG);
    expect(dec.opening).toBeCloseTo(2905.25, 2); // the credit closes November
    expect(dec.gross).toBe(round(2905.25 * 0.03 * (31 / 365)));
  });

  it('keeps a monthly history: opening, deposits, withdrawals, gross, IRS, net, closing', () => {
    const deltas = [move('2026-10-20', 1000), move('2026-11-05', 500), move('2026-11-20', -200)];
    const nov = monthStatement(deltas, '2026-11', CFG);
    expect(nov.opening).toBe(1000);
    expect(nov.deposits).toBe(500);
    expect(nov.withdrawals).toBe(200);
    expect(nov.closing).toBe(round(1000 + 500 - 200 + nov.net));
    expect(nov.gross - nov.tax).toBeCloseTo(nov.net, 2);
    expect(nov.tax).toBe(round(nov.gross * 0.28));
  });
});

describe('when money starts and stops earning', () => {
  it('a deposit earns from the next day by default, or the same day if configured', () => {
    const d = [move('2026-11-10', 1000)];
    expect(baseOn(d, '2026-11-10', CFG)).toBe(0);
    expect(baseOn(d, '2026-11-11', CFG)).toBe(1000);
    expect(baseOn(d, '2026-11-10', { ...CFG, depositLagDays: 0 })).toBe(1000);
    expect(baseOn(d, '2026-11-12', { ...CFG, depositLagDays: 2 })).toBe(1000);
    expect(baseOn(d, '2026-11-11', { ...CFG, depositLagDays: 2 })).toBe(0);
  });

  it('a withdrawal stops earning the day it leaves, or later if configured', () => {
    const d = [move('2026-11-01', 1000), move('2026-11-10', -400)];
    expect(baseOn(d, '2026-11-09', CFG)).toBe(1000);
    expect(baseOn(d, '2026-11-10', CFG)).toBe(600);
    expect(baseOn(d, '2026-11-10', { ...CFG, withdrawalLagDays: 1 })).toBe(1000);
    expect(baseOn(d, '2026-11-11', { ...CFG, withdrawalLagDays: 1 })).toBe(600);
  });
});

describe('edge cases', () => {
  it('a deposit on the last day of the month earns nothing that month and starts on the 1st', () => {
    const d = [move('2026-10-31', 5000)];
    expect(monthStatement(d, '2026-10', CFG)).toMatchObject({ gross: 0, net: 0, deposits: 5000 });
    expect(monthStatement(d, '2026-11', CFG).days).toBe(30);
    close(monthStatement(d, '2026-11', CFG).gross, round((5000 * 0.03 * 30) / 365), 2);
    expect(baseOn(d, '2026-11-01', CFG)).toBe(5000);
  });

  it('a deposit on the last day of November earns from 1 December', () => {
    const d = [move('2026-11-30', 100)];
    expect(monthStatement(d, '2026-11', CFG).gross).toBe(0);
    expect(baseOn(d, '2026-12-01', CFG)).toBe(100);
  });

  it('a zero balance earns nothing and never goes negative', () => {
    expect(monthStatement([], '2026-11', CFG)).toMatchObject({ gross: 0, tax: 0, net: 0, opening: 0, closing: 0 });
    const emptied = [move('2026-11-01', 100), move('2026-11-05', -100)];
    expect(baseOn(emptied, '2026-11-06', CFG)).toBe(0);
    expect(baseOn([move('2026-11-01', 50), move('2026-11-02', -500)], '2026-11-10', CFG)).toBe(0); // over-withdrawal is clamped
    expect(dailyGross(0, CFG)).toBe(0);
    expect(dailyGross(-5, CFG)).toBe(0);
  });

  it('a deposit and a withdrawal on the same day count as their difference', () => {
    const base = [move('2026-11-01', 1000)];
    const same = [...base, move('2026-11-10', 300), move('2026-11-10', -300)];
    expect(baseOn(same, '2026-11-10', CFG)).toBe(1000);
    expect(baseOn(same, '2026-11-11', CFG)).toBe(1000);
    const netUp = [...base, move('2026-11-10', 300), move('2026-11-10', -100)]; // +200 net: earns from tomorrow
    expect(baseOn(netUp, '2026-11-10', CFG)).toBe(1000);
    expect(baseOn(netUp, '2026-11-11', CFG)).toBe(1200);
    const netDown = [...base, move('2026-11-10', 100), move('2026-11-10', -300)]; // -200 net: stops today
    expect(baseOn(netDown, '2026-11-10', CFG)).toBe(800);
    // The statement still lists both movements.
    const st = monthStatement(netDown, '2026-11', CFG);
    expect([st.deposits, st.withdrawals]).toEqual([1100, 300]); // 1.000 on the 1st + 100 on the 10th; 300 out
  });

  it('the rate is gross: 3 % is not applied as a net rate', () => {
    const st = monthStatement([move('2026-10-31', 10_000)], '2026-11', CFG);
    expect(st.net).toBeCloseTo(st.gross * 0.72, 1);
    expect(st.net).toBeLessThan(10_000 * 0.03 * (30 / 365));
  });

  it('month and date helpers', () => {
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
    expect(creditDateFor('2026-12')).toBe('2027-01-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('building the history from check-ins, transactions and credits', () => {
  const tr = (over: object) => ({ type: 'transfer', amount: 0, account: 'ctt', toAccount: 'traderepublic', date: '2026-11-03', createdAt: '2026-11-03 10:00:00', ...over }) as never;

  it('deposits are movements; a check-in only corrects the difference', () => {
    const deltas = buildDeltas(
      'traderepublic',
      [{ account: 'traderepublic', date: '2026-11-03', value: 2900.61, createdAt: '2026-11-03 12:00:00' }],
      [],
      [],
    );
    expect(deltas).toEqual([move('2026-11-03', 2900.61)]);
  });

  it('a check-in that matches the logged movements adds nothing, and a different one corrects it', () => {
    const txs = [tr({ amount: 2900.61 }), tr({ amount: 55.1, date: '2026-11-04', createdAt: '2026-11-04 09:00:00' })];
    const matching = buildDeltas('traderepublic', [{ account: 'traderepublic', date: '2026-11-04', value: 2955.71, createdAt: '2026-11-04 18:00:00' }], txs, []);
    expect(matching).toEqual([move('2026-11-03', 2900.61), move('2026-11-04', 55.1)]);
    const corrected = buildDeltas('traderepublic', [{ account: 'traderepublic', date: '2026-11-04', value: 2960, createdAt: '2026-11-04 18:00:00' }], txs, []);
    expect(corrected.at(-1)).toEqual(move('2026-11-04', 4.29));
  });

  it('other accounts are ignored, and withdrawals are negative', () => {
    const txs = [
      tr({ amount: 100 }),
      { type: 'transfer', amount: 40, account: 'traderepublic', toAccount: 'ctt', date: '2026-11-05', createdAt: '2026-11-05 10:00:00' } as never,
      { type: 'purchase', amount: 9, account: 'ctt', toAccount: null, date: '2026-11-05', createdAt: '2026-11-05 10:00:00' } as never,
    ];
    expect(buildDeltas('traderepublic', [{ account: 'revolut', date: '2026-11-01', value: 999, createdAt: null }], txs, [])).toEqual([move('2026-11-03', 100), move('2026-11-05', -40)]);
  });

  it('a real balance recorded after a credit reconciles the estimate instead of double counting it', () => {
    const snaps = [{ account: 'traderepublic', date: '2026-11-03', value: 2900.61, createdAt: '2026-11-03 12:00:00' }];
    const withCredit = buildDeltas('traderepublic', snaps, [], [{ creditDate: '2026-12-01', net: 4.64 }]);
    expect(withCredit).toEqual([move('2026-11-03', 2900.61), credit('2026-12-01', 4.64)]);
    // The user then records the real balance (2.905,30 €): only the 5 cents of difference are added.
    const reconciled = buildDeltas('traderepublic', [...snaps, { account: 'traderepublic', date: '2026-12-02', value: 2905.3, createdAt: '2026-12-02 08:00:00' }], [], [{ creditDate: '2026-12-01', net: 4.64 }]);
    expect(reconciled.at(-1)).toEqual(move('2026-12-02', 0.05));
  });
});

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
