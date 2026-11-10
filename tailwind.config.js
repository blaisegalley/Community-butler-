/** @type {import('tailwindcss').Config} */
export default {
  content: ['./*.html', './request/*.html', './auth/*.html', './admin/*.html', './butlers/*.html', './src/**/*.{js,ts,jsx,tsx}'],
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
        chrome: '#D8DEE2',
      },
    },
  },
  // Touch screens fire :hover on tap and then leave it stuck. This gates every
  // hover: style behind a device that can actually hover.
  future: { hoverOnlyWhenSupported: true },
  plugins: [],
};
