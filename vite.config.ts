/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
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
  plugins: [react(), tailwindcss()],
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
  },
})
