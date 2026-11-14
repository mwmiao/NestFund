import { describe, expect, it } from 'vitest';
import { isMoreActive } from '@/components/layout/nav';

describe('isMoreActive', () => {
  it('is true on pages reached through the More sheet', () => {
    for (const p of ['/reports', '/reports/over-time', '/simulators', '/settings', '/settings/backup', '/transactions/categories', '/transactions/rules'])
      expect(isMoreActive(p), p).toBe(true);
  });
  it('is false on the five main tabs', () => {
    for (const p of ['/', '/transactions', '/transactions/new', '/transactions/12', '/budget', '/goals', '/portfolio']) expect(isMoreActive(p), p).toBe(false);
  });
});
