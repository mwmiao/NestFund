import Link from 'next/link';
import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="py-20 text-center">
      <p className="text-5xl font-semibold">404</p>
      <Link href="/" className="btn-primary mt-6">
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}
