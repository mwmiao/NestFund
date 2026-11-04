'use client';

import dynamic from 'next/dynamic';

// Recharts is the biggest dependency of the app (~120 kB). Charts load after the page is already usable, in their own chunk,
// with a placeholder of the same height so the layout does not jump.
const placeholder = (height: number) => <div className="skeleton w-full" style={{ height }} aria-hidden />;

type Mod = typeof import('./Charts');

export const DonutChart = dynamic<React.ComponentProps<Mod['DonutChart']>>(() => import('./Charts').then((m) => m.DonutChart), { ssr: false, loading: () => placeholder(220) });
export const BarsChart = dynamic<React.ComponentProps<Mod['BarsChart']>>(() => import('./Charts').then((m) => m.BarsChart), { ssr: false, loading: () => placeholder(260) });
export const LinesChart = dynamic<React.ComponentProps<Mod['LinesChart']>>(() => import('./Charts').then((m) => m.LinesChart), { ssr: false, loading: () => placeholder(260) });
export const GrowthChart = dynamic<React.ComponentProps<Mod['GrowthChart']>>(() => import('./Charts').then((m) => m.GrowthChart), { ssr: false, loading: () => placeholder(280) });
