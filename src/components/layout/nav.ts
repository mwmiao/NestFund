export const NAV_ITEMS = [
  { href: '/', key: 'nav.dashboard', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
  { href: '/transactions', key: 'nav.transactions', icon: 'M4 6h16M4 12h16M4 18h10' },
  { href: '/budget', key: 'nav.budget', icon: 'M4 19V9m6 10V5m6 14v-7m4 7H2' },
  { href: '/goals', key: 'nav.goals', icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-4a5 5 0 100-10 5 5 0 000 10zm0-4a1 1 0 100-2 1 1 0 000 2z' },
  { href: '/simulators', key: 'nav.simulators', icon: 'M4 4h16v16H4zM8 8h3M8 12h8M8 16h8M14 8h2' },
  { href: '/portfolio', key: 'nav.portfolio', icon: 'M3 17l6-6 4 4 8-8M15 7h6v6' },
  { href: '/history', key: 'nav.history', icon: 'M12 8v4l3 2M3 12a9 9 0 109-9 9 9 0 00-7 3.4M3 4v4h4' },
] as const;

export const isActive = (pathname: string, href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
