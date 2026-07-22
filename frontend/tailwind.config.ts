import type { Config } from 'tailwindcss';

export default {
  darkMode: 'media',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: 'var(--color-surface)',
        'on-surface': 'var(--color-on-surface)',
      }
    },
  },
  plugins: [],
} satisfies Config;
