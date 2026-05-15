import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Aman Agency',
        short_name: 'AmanAgency',
        description: 'Aman Agency Mobile Store Management',
        theme_color: '#0f172a',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          // TODO: create pwa-512x512-maskable.png (content within 80% safe zone)
          // then add: { src: 'pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
      },
      workbox: {
        // Remove service-worker cache entries that belong to an older build.
        // Without this, a SW installed from a previous deploy can serve stale
        // precached chunks even after the user's browser gets a fresh index.html.
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Static reference data — safe to cache, low cardinality.
            urlPattern: /\/api\/v1\/(collections|products|brands|settings|vendors|customers)[^?]*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-reference',
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
          {
            // High-cardinality paginated endpoints — skip cache to avoid
            // evicting reference data and to always show fresh data.
            urlPattern: /\/api\/v1\/(sales|purchases|bills|logs|expenses|payment-promises|admin)/i,
            handler: 'NetworkOnly',
          },
          {
            // Dashboard + reports aggregations — short TTL.
            urlPattern: /\/api\/v1\/(dashboard|reports|finance)/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-analytics',
              expiration: { maxEntries: 20, maxAgeSeconds: 5 * 60 },
              networkTimeoutSeconds: 10,
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
