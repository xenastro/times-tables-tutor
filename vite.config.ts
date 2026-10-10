import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Times Tables',
        short_name: 'Times Tables',
        description: 'Calm, daily times tables practice.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f6f2',
        theme_color: '#0f8b8d',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // The Arabic voice clips are kept once fetched (not all up front: most learners need few or none).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/voice/'),
            handler: 'CacheFirst',
            options: { cacheName: 'voice', expiration: { maxEntries: 1500 } },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
