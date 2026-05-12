/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#111111',
        muted: '#888888',
        border: '#E5E5E5',
        'dark-card': '#1A1A1A',
        blob: '#F0F0F0',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        manrope: ['Manrope', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'nav': '14px',
        'company': '13px',
        'role': '15px',
        'location': '13px',
        'detail-heading': '20px',
        'body': '15px',
      },
      lineHeight: {
        'body': '1.6',
      },
    },
  },
  plugins: [],
};
