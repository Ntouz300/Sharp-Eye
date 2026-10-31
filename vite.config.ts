import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // Chemins relatifs : l'app fonctionne à la racine d'un domaine comme dans un sous-dossier (GitHub Pages).
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/*.png', 'icons/icon.svg'],
      manifest: {
        name: 'Échiquier Lucide',
        short_name: 'Lucide',
        description: "Revue de parties d'échecs : précision, étiquettes de coups et moments clés.",
        lang: 'fr',
        display: 'standalone',
        orientation: 'any',
        start_url: './',
        scope: './',
        background_color: '#F6F0E2',
        theme_color: '#F6F0E2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,json}'],
        // Le moteur WebAssembly pèse environ 7 Mo : on l'autorise dans le cache hors ligne.
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
