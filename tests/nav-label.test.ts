import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import en from '@/i18n/locales/en-US.json';
import pt from '@/i18n/locales/pt-PT.json';

describe('navigation landmark label', () => {
  it('is translated in both languages', () => {
    expect(en.nav.main).toBe('Main');
    expect(pt.nav.main).toBeTruthy();
    expect(pt.nav.main).not.toBe(en.nav.main);
  });
  it('is used by both navigation components instead of a hard-coded string', () => {
    for (const file of ['src/components/layout/Sidebar.tsx', 'src/components/layout/BottomNav.tsx']) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source, file).toContain("aria-label={t('nav.main')}");
      expect(source, file).not.toMatch(/aria-label="[A-Za-z]/);
    }
  });
});
