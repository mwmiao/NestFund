import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import '@fontsource-variable/inter';
import './globals.css';
import { BottomNav } from '@/components/layout/BottomNav';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { AccountsProvider } from '@/components/AccountsProvider';
import { PwaClient } from '@/components/pwa/PwaClient';
import { I18nProvider } from '@/i18n/client';
import { getI18n } from '@/i18n/server';
import { visibleAccounts } from '@/lib/repo';
import { ACCOUNT_IDS } from '@/lib/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  // Pages set their own title; the template appends the app name ("Orçamento mensal · NestFund").
  title: { default: 'NestFund', template: '%s · NestFund' },
  description: 'Personal finance dashboard for budgeting, expense tracking, savings goals and long-term investing.',
  icons: { icon: '/icon.svg', apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }] },
  manifest: '/manifest.webmanifest',
  // iOS "Add to Home Screen": opens full screen with its own name, and numbers are never turned into phone links.
  appleWebApp: { capable: true, title: 'NestFund', statusBarStyle: 'default' },
  formatDetection: { telephone: false, email: false, address: false },
  // Older iOS versions only look for this tag; newer ones read the manifest.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
    { media: '(prefers-color-scheme: light)', color: '#f6f6f7' },
  ],
};

/**
 * The accounts list only personalises the pickers. If the database is unreachable the shell must still render, so the
 * page's own error boundary (error.tsx) can explain the problem with the navigation intact.
 */
function accountsOrAll() {
  try {
    return visibleAccounts();
  } catch (error) {
    console.error('Could not read the hidden accounts; showing every account.', error);
    return [...ACCOUNT_IDS];
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : ''}>
      <body className="min-h-screen">
        <a
          href="#main-content"
          className="btn-primary sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:px-4 focus:py-2.5"
        >
          {t('nav.skipToContent')}
        </a>
        <I18nProvider locale={locale}>
          <AccountsProvider visible={accountsOrAll()}>
            <Sidebar theme={theme} />
            <Header theme={theme} />
            <div className="lg:pl-60">
              <main
                id="main-content"
                tabIndex={-1}
                className="mx-auto max-w-5xl px-4 pb-32 pt-5 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8"
              >
                {children}
              </main>
              <footer className="muted mx-auto hidden max-w-5xl px-10 pb-8 text-xs lg:block">{t('app.disclaimer')}</footer>
            </div>
            <BottomNav />
            <PwaClient />
          </AccountsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
