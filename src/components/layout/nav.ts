// Single source of truth for navigation (desktop sidebar + mobile bottom bar / "More" sheet).

export interface NavItem {
  href: string;
  key: string;
  icon: string;
}

const I = {
  home: 'M3 11.5L12 4l9 7.5M5.5 10v9.5h4.5v-5.5h4v5.5h4.5V10',
  list: 'M8 6h12M8 12h12M8 18h8M4 6h.01M4 12h.01M4 18h.01',
  budget: 'M4 20V10m5.33 10V4m5.34 16v-7M20 20v-4',
  goal: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z',
  portfolio: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  calc: 'M6 3h12a1 1 0 011 1v16a1 1 0 01-1 1H6a1 1 0 01-1-1V4a1 1 0 011-1zm2 4h8M8 11h2m3 0h3M8 15h2m3 0h3M8 19h2m3 0h3',
  history: 'M12 8v4l3 2M3.05 11a9 9 0 112.9 6.6M3 4v5h5',
  tags: 'M3 12V4a1 1 0 011-1h8l9 9-9 9-9-9zm5-4.5h.01',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zm7.4-3a7.4 7.4 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2-1.2L14.5 3h-4l-.4 2.6a7.6 7.6 0 00-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 000 2.4l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002 1.2l.4 2.6h4l.4-2.6a7.6 7.6 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  plus: 'M12 5v14M5 12h14',
  more: 'M4 7h16M4 12h16M4 17h16',
};
export const NAV_ICONS = I;

/** Everyday destinations. */
export const PRIMARY_NAV: NavItem[] = [
  { href: '/', key: 'nav.dashboard', icon: I.home },
  { href: '/transactions', key: 'nav.transactions', icon: I.list },
  { href: '/budget', key: 'nav.budget', icon: I.budget },
  { href: '/goals', key: 'nav.goals', icon: I.goal },
  { href: '/portfolio', key: 'nav.portfolio', icon: I.portfolio },
];

/** Occasional tools. */
export const SECONDARY_NAV: NavItem[] = [
  { href: '/simulators', key: 'nav.simulators', icon: I.calc },
  { href: '/history', key: 'nav.history', icon: I.history },
  { href: '/transactions/categories', key: 'nav.categories', icon: I.tags },
  { href: '/settings', key: 'nav.settings', icon: I.settings },
];

/** Mobile bottom bar: two items, the add button, one item, then "More". */
export const MOBILE_TABS: NavItem[] = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[2]];
export const MOBILE_MORE: NavItem[] = [PRIMARY_NAV[3], PRIMARY_NAV[4], ...SECONDARY_NAV];

export function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  // "/transactions" must not light up on "/transactions/categories".
  if (href === '/transactions') return pathname === '/transactions' || /^\/transactions\/(new|\d+)/.test(pathname);
  return pathname.startsWith(href);
}
