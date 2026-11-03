import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { I18nProvider } from '@/i18n/client';
import { getI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NestFund',
  description: 'Personal finance planner and expense tracker',
  icons: { icon: '/icon.svg' },
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#09090b',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : ''}>
      <body className="min-h-screen">
        <I18nProvider locale={locale}>
          <Header theme={theme} />
          <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 md:pb-12">{children}</main>
          <footer className="muted mx-auto hidden max-w-6xl px-6 pb-8 text-xs md:block">{t('app.disclaimer')}</footer>
          <BottomNav />
        </I18nProvider>
      </body>
    </html>
  );
}
