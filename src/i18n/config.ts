import ptPT from './locales/pt-PT.json';
import enUS from './locales/en-US.json';

export const LOCALES = ['pt-PT', 'en-US'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'pt-PT';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export type Dictionary = typeof ptPT;
export const dictionaries: Record<Locale, Dictionary> = { 'pt-PT': ptPT, 'en-US': enUS };

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/** Resolves dotted keys ("dashboard.title") and interpolates {placeholders}. Missing keys fall back to pt-PT, then to the key. */
export function makeT(dict: Dictionary): TFunction {
  const lookup = (d: unknown, key: string) =>
    key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), d);
  return (key, vars) => {
    let value = lookup(dict, key);
    if (typeof value !== 'string') value = lookup(ptPT, key);
    if (typeof value !== 'string') return key;
    return vars ? (value as string).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? `{${v}}`)) : (value as string);
  };
}
