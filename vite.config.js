import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync } from 'fs'

// Em produção (GitHub Pages) o app vive em /polo-estoque/ — o workflow define VITE_BASE.
const base = process.env.VITE_BASE || '/'

// Copia index.html → 404.html para que GitHub Pages sirva o app em rotas diretas (SPA fallback)
const ghPagesFallback = {
  name: 'gh-pages-404-fallback',
  closeBundle() {
    try { copyFileSync('dist/index.html', 'dist/404.html') } catch {}
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
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Aurum Cozinha Pro',
        short_name: 'Aurum Cozinha',
        description: 'Controle de produção de cozinha — Aurum',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1B2A41',
        theme_color: '#1B2A41',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
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
