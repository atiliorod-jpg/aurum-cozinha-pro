/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        polo: {
          navy: '#1B2A41',
          gold: '#C9A24B',
          beige: '#F3EFE6',
        }
      },
      // Jeito do Magurō (23/11/2026): Inter no texto, Montserrat nos títulos
      // (`font-titulo`). As letras vêm guardadas no app — ver main.jsx.
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        titulo: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

