import { redirect } from 'next/navigation';

/** History now lives in Reports ("Over time"). Old links and bookmarks land there. */
export default function HistoryPage(): never {
  redirect('/reports?view=time');
}
