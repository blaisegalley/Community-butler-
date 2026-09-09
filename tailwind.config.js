/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './request/*.html', './auth/*.html', './admin/*.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        ink: '#0B0F0D',
        forest: {
          DEFAULT: '#1F3327',
          light: '#3C5A45',
        },
        sand: '#F4EEE3',
        stone: '#E7DFCF',
        graphite: '#5B6660',
        charcoal: '#161A17',
        silver: '#C7CDC5',
        ember: '#C6602B',
      },
    },
  },
  plugins: [],
};
