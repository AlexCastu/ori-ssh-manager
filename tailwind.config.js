/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        superficie: 'var(--superficie)',
        'superficie-hover': 'var(--superficie-hover)',
        'superficie-fuerte': 'var(--superficie-fuerte)',
        panel: 'var(--panel)',
        modal: 'var(--modal)',
        hundido: 'var(--hundido)',
        borde: 'var(--borde)',
        'borde-fuerte': 'var(--borde-fuerte)',
        texto: 'var(--texto)',
        'texto-suave': 'var(--texto-suave)',
        'texto-tenue': 'var(--texto-tenue)',
        acento: 'var(--acento)',
        'acento-2': 'var(--acento-2)',
        peligro: 'var(--peligro)',
        exito: 'var(--exito)',
        aviso: 'var(--aviso)',
      },
    },
  },
  plugins: [],
}
