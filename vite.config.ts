import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/notesdiary/',
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,ttf,woff,woff2}'
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20 },
            },
          },
          {
            urlPattern: /.*(\.ttf|\.woff|\.woff2)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'local-fonts',
            },
          },
        ],
      },
      manifest: {
        name: 'Notes Diary',
        short_name: 'Notes Diary',
        description: 'A local-first diary app with hashtag organization',
        start_url: '/notesdiary/',
        scope: '/notesdiary/',
        display: 'standalone',
        background_color: '#FFFFFF',
        theme_color: '#081A59',
        orientation: 'portrait-primary',
      },
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
      ],
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icons/icon-512x512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/apple-touch-icon-180x180.png',
          sizes: '180x180',
          type: 'image/png',
        },
      ],
    }),
  ],
})
