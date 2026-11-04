import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import '@fontsource-variable/inter';
import './globals.css';
import { BottomNav } from '@/components/layout/BottomNav';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { PwaClient } from '@/components/pwa/PwaClient';
import { I18nProvider } from '@/i18n/client';
import { getI18n } from '@/i18n/server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'NestFund',
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  const theme = (await cookies()).get('theme')?.value === 'light' ? 'light' : 'dark';
  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : ''}>
      <body className="min-h-screen">
        <I18nProvider locale={locale}>
          <Sidebar theme={theme} />
          <Header theme={theme} />
          <div className="lg:pl-60">
            <main className="mx-auto max-w-5xl px-4 pb-32 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>
            <footer className="muted mx-auto hidden max-w-5xl px-10 pb-8 text-xs lg:block">{t('app.disclaimer')}</footer>
          </div>
          <BottomNav />
          <PwaClient />
        </I18nProvider>
      </body>
    </html>
  );
}
