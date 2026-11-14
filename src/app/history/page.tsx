import { redirect } from 'next/navigation';

/** History now lives in Reports ("Over time"). Old links and bookmarks land there. */
export default function HistoryPage() {
  redirect('/reports/over-time');
}
