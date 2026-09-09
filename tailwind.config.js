/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './request/*.html', './auth/*.html', './admin/*.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
