/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ---- EFAC primary palette (from brand guidelines) ----
        orange: { DEFAULT: '#f48c06', dark: '#d97a00', tint: '#fef0dd' },
        gold: '#ffba08',
        red: { DEFAULT: '#d00000', dark: '#9d0208' },
        maroon: '#6a040f',
        teal: { DEFAULT: '#086778', dark: '#06515f', tint: '#e4f1f3' },
        cyan: '#07a0c3', // brand "teal-light" — secondary accent / charts
        ink: '#03071e', // all primary text; text on orange buttons

        // ---- hi-fi UI neutrals (warm-toned) ----
        paper: '#faf6ef', // app background
        card: '#ffffff', // panel surfaces
        line: '#ece4d6', // borders / dividers
        muted: '#6c7077', // secondary / label text
        track: '#eee5d6', // progress bar background
        edge: '#d8cfbf', // ghost-button border

        // ---- backward-compatible aliases (existing markup keeps working) ----
        navy: '#03071e',
        sand: '#f1e9da',
        clay: '#d00000',
      },
      fontFamily: {
        // Display / titles / big numerals — Spectral (≈ Poppl Laudatio)
        display: ['Spectral', 'Georgia', 'serif'],
        // Headers, body, all UI — Mulish (humanist sans)
        sans: ['Mulish', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '16px',
        btn: '11px',
      },
      boxShadow: {
        frame: '0 18px 50px -18px rgba(3,7,30,.22)',
      },
    },
  },
  plugins: [],
}