import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      spacing: {
        // Minimum touch target — 48px per the brief.
        tap: '3rem',
      },
      colors: {
        pitch: {
          DEFAULT: '#0b6b3a',
          dark: '#074a28',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
