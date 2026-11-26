/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ⚠️ REDESIGN (25/11/2026, proposta aprovada pelo dono): os tons a mais
        // da marca. `gold-700` é o dourado que dá para LER sobre bege (títulos
        // de grupo); `tinta` é o cinza de texto com contraste; `linha`, as bordas.
        polo: {
          navy: '#1B2A41',
          'navy-700': '#2B3F5E',
          gold: '#C9A24B',
          'gold-700': '#7A5C16',
          'gold-100': '#F3E7C8',
          beige: '#F3EFE6',
          tinta: '#4A5568',
          linha: '#D9D2C3',
          // botão desligado: bege escuro com texto legível (não o cinza azulado)
          desligado: '#E8E2D6',
          'desligado-tinta': '#5B5346',
        },
        ok: { DEFAULT: '#1E6B43', suave: '#DDEFE4', tinta: '#14532E' },
        // ⚠️ vermelho só para destruir e registrar descarte (e erro)
        perigo: { DEFAULT: '#A4161A', suave: '#FBE3E1', tinta: '#7F1215' },
      },
      // Jeito do Magurō (23/11/2026): Inter no texto, Montserrat nos títulos
      // (`font-titulo`). As letras vêm guardadas no app — ver main.jsx.
      // ⚠️ `alto:` = TELA ALTA (1000 px ou mais: tablet em pé, monitor grande).
      // Os tamanhos grandes do redesign (25/11/2026) nas janelas que não podem
      // rolar (imprimir, desperdício) só valem aí: no celular e no notebook de
      // 720 px a janela voltava a rolar (regra do dono: tudo à vista).
      screens: {
        alto: { raw: '(min-height: 1000px)' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        titulo: ['Montserrat', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

