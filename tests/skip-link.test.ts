import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');

describe('skip link', () => {
  it('points at a main element that has the matching id and can take focus', () => {
    expect(layout).toContain('href="#main-content"');
    expect(layout).toMatch(/<main[^>]*id="main-content"[^>]*tabIndex=\{-1\}/);
  });

  it('is the first element in the body, before the providers and navigation', () => {
    const body = layout.indexOf('<body');
    expect(layout.indexOf('href="#main-content"')).toBeGreaterThan(body);
    expect(layout.indexOf('href="#main-content"')).toBeLessThan(layout.indexOf('<I18nProvider'));
  });

  it('has a label in both languages', () => {
    for (const f of ['en-US', 'pt-PT']) {
      const dict = JSON.parse(fs.readFileSync(`src/i18n/locales/${f}.json`, 'utf8'));
      expect(typeof dict.nav.skipToContent, f).toBe('string');
    }
  });
});
