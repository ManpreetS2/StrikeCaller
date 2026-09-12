/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolvePagesBase } from './scripts/pages-base.mjs'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const isPagesBuild = process.env.GITHUB_PAGES === 'true'

// The Pages base is derived from GitHub's canonical Pages URL (PAGES_BASE_URL,
// injected by actions/configure-pages) so asset paths always match the exact,
// case-sensitive path GitHub serves. Non-Pages builds stay at '/'.
const base = resolvePagesBase({ isPagesBuild, pagesBaseUrl: process.env.PAGES_BASE_URL })

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      disable: process.env.VITEST === 'true',
      registerType: 'prompt',
      injectRegister: false,
      filename: 'sw.js',
      manifest: false,
      includeManifestIcons: false,
      devOptions: { enabled: false },
      workbox: {
        skipWaiting: false,
        clientsClaim: false,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/cdn-cgi\//, /cloudflareinsights/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/dist-pages/**', '**/e2e/**'],
    // Each file gets its own process so fake timers / IDB setup cannot leak
    // across AppProvider tests that share a 5s timeout.
    pool: 'forks',
    isolate: true,
    testTimeout: 15_000,
  },
})
