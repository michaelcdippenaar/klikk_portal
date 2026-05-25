/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts}'],
  // Klikk design language uses data-theme="dark" on <html>.
  // Tailwind's selector strategy fires dark: variants on [data-theme="dark"] descendants.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: '#2B2D6E', dark: '#23255a', light: '#3b3e8f' },
        accent:  { DEFAULT: '#FF3D7F', light: '#FF6B9D', dark: '#E02D6B' },
        surface: { DEFAULT: '#F5F5F8', secondary: '#F0EFF8' },
        success: { 50: '#f0fdfa', 100: '#ccfbf1', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e' },
        warning: { 50: '#fffbeb', 100: '#fef3c7',                 500: '#f59e0b', 600: '#d97706', 700: '#b45309' },
        danger:  { 50: '#fef2f2', 100: '#fee2e2', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c' },
        info:    { 50: '#eff6ff', 100: '#dbeafe',                 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Finance-admin density pass — ~12-15% smaller than general KDL defaults.
        // Portal-level override; do not merge upstream without review.
        micro: ['11px', { lineHeight: '15px', fontWeight: '500' }],
        xs:    ['12px', { lineHeight: '16px' }],
        sm:    ['13px', { lineHeight: '18px' }],
        base:  ['13px', { lineHeight: '18px' }],
        lg:    ['15px', { lineHeight: '22px' }],
        xl:    ['18px', { lineHeight: '24px' }],
        '2xl': ['22px', { lineHeight: '28px' }],
        '3xl': ['28px', { lineHeight: '34px' }],
      },
      borderRadius: {
        // Finance-admin density pass — one step tighter than general KDL.
        // md  = 4px  (chips, tags)
        // lg  = 6px  (buttons, inputs)
        // xl  = 8px  (cards, modals)
        // full = pill
        md:  '4px',
        lg:  '6px',
        xl:  '8px',
      },
      boxShadow: {
        soft:     'var(--shadow-soft)',
        lifted:   'var(--shadow-lifted)',
        floating: 'var(--shadow-floating)',
      },
      transitionDuration: {
        short:  '150ms',
        medium: '200ms',
      },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        enter:    'cubic-bezier(0, 0, 0, 1)',
      },
    },
  },
  plugins: [],
}
