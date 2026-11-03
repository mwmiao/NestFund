import type { Config } from 'tailwindcss';

// Design tokens live as CSS variables in globals.css (light + dark); Tailwind maps them to names.
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        canvas: token('canvas'), // page background
        surface: token('surface'), // cards
        raised: token('raised'), // inputs, chips, hover fills
        line: token('line'), // borders and dividers
        ink: token('ink'), // primary text
        subtle: token('subtle'), // secondary text
        positive: token('positive'),
        caution: token('caution'),
        negative: token('negative'),
        info: token('info'),
        'bar-positive': token('bar-positive'),
        'bar-caution': token('bar-caution'),
        'bar-negative': token('bar-negative'),
        brand: {
          50: '#ecfdf5',
          100: '#d1fae5',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
      },
      borderRadius: {
        card: '1.25rem',
        control: '0.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)',
        pop: '0 10px 30px -10px rgb(16 24 40 / 0.25)',
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
};

export default config;
