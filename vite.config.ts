import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this repo at /altyn-dan-menu/, so the base path
// must match there but stay "/" for local dev and other hosts.
const base = process.env.GITHUB_PAGES ? '/altyn-dan-menu/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'Учёт рабочего времени',
        short_name: 'Тайм-трекер',
        description: 'Учёт рабочего времени по проектам с отчётами за день и неделю',
        theme_color: '#4f46e5',
        background_color: '#f8fafc',
        display: 'standalone',
        lang: 'ru',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      },
    }),
  ],
})
