import 'server-only';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, dictionaries, isLocale, makeT, type Locale } from './config';

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  return { locale, dict, t: makeT(dict) };
}

/**
 * `generateMetadata` for a page whose title is one or more translation keys, joined with " – ".
 * Use the same key as the page heading so the title and the heading never disagree.
 */
export const pageTitle =
  (...keys: string[]) =>
  async (): Promise<Metadata> => {
    const { t } = await getI18n();
    return { title: keys.map((k) => t(k)).join(' – ') };
  };
