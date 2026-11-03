'use client';

import { createContext, useContext, useMemo } from 'react';
import { dictionaries, makeT, type Locale, type TFunction } from './config';

const I18nContext = createContext<{ locale: Locale; t: TFunction } | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: makeT(dictionaries[locale]) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
