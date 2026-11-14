import { HistoryView } from '@/components/reports/HistoryView';
import { ReportTabs } from '@/components/reports/ReportTabs';
import { PageHeader } from '@/components/ui';
import { getI18n } from '@/i18n/server';

export default async function ReportsOverTimePage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t('reports.title')} subtitle={t('reports.viewTimeHint')} />
      <ReportTabs active="time" t={t} />
      <HistoryView />
    </>
  );
}
