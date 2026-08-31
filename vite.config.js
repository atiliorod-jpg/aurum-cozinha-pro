import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync } from 'fs'

// Onde o app mora. Com domínio próprio (app.aurumcozinha.com.br) é a RAIZ; o
// workflow define VITE_BASE.
//
// ⚠️ VALOR ESTRANHO VIRA RAIZ, e isto pegou um defeito de verdade: rodando o
// build pelo Git Bash no Windows, `VITE_BASE=/` chega aqui como
// "C:/Program Files/Git/" — o shell converte a barra em caminho do Windows. O
// build passa, ninguém vê erro, e o manifesto do app instalável sai com
// `start_url` apontando para uma pasta do computador de quem compilou. O PWA
// instalado abre em nada.
// Não acontece no servidor (Linux não faz essa conversão), mas um build local
// publicado à mão bastaria. Só caminho que começa com "/" é aceito.
const bruto = process.env.VITE_BASE || '/'
const base = /^\/[^\s]*$/.test(bruto) ? bruto : '/'
if (base !== bruto) console.warn(`[vite] VITE_BASE inválido (${bruto}) — usando "/"`)

// Copia index.html → 404.html para que GitHub Pages sirva o app em rotas diretas (SPA fallback)
const ghPagesFallback = {
  name: 'gh-pages-404-fallback',
  closeBundle() {
    try { copyFileSync('dist/index.html', 'dist/404.html') } catch { /* dist ainda não existe (dev) */ }
  },
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    ghPagesFallback,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo-aurum.png', 'pwa-192.png', 'pwa-512.png', 'pwa-maskable-512.png'],
      manifest: {
        name: 'Aurum Cozinha Pro',
        short_name: 'Aurum Cozinha',
        description: 'Controle de estoque e produção de cozinha profissional',
        start_url: base,
        scope: base,
        display: 'standalone',
        // 'any': tablets de bancada ficam em paisagem — travar em retrato
        // obrigava a virar o aparelho (o layout já é fluido nas duas).
        orientation: 'any',
        background_color: '#1B2A41',
        theme_color: '#1B2A41',
        categories: ['food', 'productivity', 'business'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
        cleanupOutdatedCaches: true,
        // o chunk do xlsx passa de 2 MB no limite padrão do precache
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})
