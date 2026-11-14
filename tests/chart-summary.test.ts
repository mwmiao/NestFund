import { describe, expect, it } from 'vitest';
import { seriesStats, topSlices } from '@/lib/chart-summary';

const data = [
  { label: 'Jan', a: 10, b: 5 },
  { label: 'Feb', a: 30, b: 1 },
  { label: 'Mar', a: 20, b: 9 },
];

describe('seriesStats', () => {
  it('returns first, last, min and max per series with x labels', () => {
    const [a, b] = seriesStats(data, 'label', [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }]);
    expect(a).toEqual({ name: 'A', first: { x: 'Jan', value: 10 }, last: { x: 'Mar', value: 20 }, min: { x: 'Jan', value: 10 }, max: { x: 'Feb', value: 30 } });
    expect(b.min).toEqual({ x: 'Feb', value: 1 });
    expect(b.max).toEqual({ x: 'Mar', value: 9 });
  });

  it('skips a series with no numeric values', () => {
    const out = seriesStats([{ label: 'Jan', a: 'x' }], 'label', [{ key: 'a', name: 'A' }, { key: 'zz', name: 'Z' }]);
    expect(out).toEqual([]);
  });

  it('ignores rows missing the series only for that series', () => {
    const rows = [{ label: 'Jan', a: 1 }, { label: 'Feb', b: 7 }, { label: 'Mar', a: 3, b: 2 }];
    const [a, b] = seriesStats(rows, 'label', [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }]);
    expect(a.first.x).toBe('Jan');
    expect(a.last.x).toBe('Mar');
    expect(b.first).toEqual({ x: 'Feb', value: 7 });
    expect(b.last).toEqual({ x: 'Mar', value: 2 });
  });
});

describe('topSlices', () => {
  it('drops zero/negative, sorts descending and caps at n', () => {
    const slices = [{ name: 'a', value: 5 }, { name: 'b', value: 0 }, { name: 'c', value: -3 }, { name: 'd', value: 9 }, { name: 'e', value: 7 }];
    expect(topSlices(slices, 2).map((s) => s.name)).toEqual(['d', 'e']);
    expect(topSlices(slices).map((s) => s.name)).toEqual(['d', 'e', 'a']);
  });
});
