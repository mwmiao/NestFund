import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('error pages', () => {
  it('error.tsx is a client component with a retry button using translated text', () => {
    const src = read('src/app/error.tsx');
    expect(src.startsWith("'use client'")).toBe(true);
    expect(src).toContain('router.refresh()');
    expect(src).toContain('reset()');
    for (const key of ['error.title', 'error.hint', 'error.retry']) expect(src).toContain(`'${key}'`);
  });

  it('global-error.tsx renders its own document, because the root layout is what failed', () => {
    const src = read('src/app/global-error.tsx');
    expect(src.startsWith("'use client'")).toBe(true);
    expect(src).toContain('<html');
    expect(src).toContain('<body');
    expect(src).toContain("import './globals.css'");
    expect(src).toContain('window.location.reload()');
    expect(src).not.toContain('useI18n'); // providers live in the layout that failed
  });

  it('every error key exists in both locales', () => {
    for (const f of ['en-US', 'pt-PT']) {
      const dict = JSON.parse(read(`src/i18n/locales/${f}.json`));
      for (const k of ['title', 'hint', 'retry', 'reference']) expect(typeof dict.error?.[k], `${f} error.${k}`).toBe('string');
    }
  });
});
