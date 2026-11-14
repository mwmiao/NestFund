import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// getI18n reads the locale cookie; pin it to English so expected titles are stable.
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'en-US' }) }) }));

import { pageTitle } from '@/i18n/server';

function pageFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? pageFiles(p) : e.name === 'page.tsx' ? [p] : [];
  });
}

// Redirect-only pages never render, so they need no title.
const REDIRECT_ONLY = [path.join('history', 'page.tsx')];

describe('page titles', () => {
  it('every rendered page sets its own title', () => {
    const missing = pageFiles(path.resolve('src/app'))
      .filter((f) => !REDIRECT_ONLY.some((r) => f.endsWith(r)))
      .filter((f) => !fs.readFileSync(f, 'utf8').includes('generateMetadata'));
    expect(missing).toEqual([]);
  });

  it('translates one key, and joins several with an en dash', async () => {
    expect(await pageTitle('nav.budget')()).toEqual({ title: 'Budget' });
    expect(await pageTitle('reports.title', 'reports.view.time')()).toEqual({ title: 'Reports – Over time' });
  });
});
