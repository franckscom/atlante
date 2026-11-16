// Configuration de Vite (l'outil qui assemble l'app) et de Vitest (les tests).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // L'app est servie par GitHub Pages sous https://<compte>.github.io/atlante/
  base: '/atlante/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt' : une nouvelle version n'est activée que quand tu cliques sur « Mettre à jour ».
      registerType: 'prompt',
      includeAssets: ['icone.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Atlante',
        short_name: 'Atlante',
        description: 'Base de connaissance personnelle, privée et hors ligne.',
        lang: 'fr',
        display: 'standalone',
        start_url: '/atlante/',
        scope: '/atlante/',
        background_color: '#f6f3ec',
        theme_color: '#1f3a5f',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Tous les fichiers de l'app sont mis en cache : elle démarre sans Internet.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/atlante/index.html',
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
