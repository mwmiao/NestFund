import 'server-only';
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
