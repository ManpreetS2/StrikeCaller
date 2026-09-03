/**
 * Cross-platform GitHub Pages Vite runner.
 * Sets GITHUB_PAGES=true without Unix-only shell syntax so
 * `npm run build:pages` works on Windows and Linux.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const command = process.argv[2]
if (command !== 'build' && command !== 'preview') {
  console.error('Usage: node scripts/run-pages.mjs <build|preview>')
  process.exit(1)
}

process.env.GITHUB_PAGES = 'true'

const viteJs = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules/vite/bin/vite.js')
const args = command === 'preview' ? ['preview', '--base', '/StrikeCaller/'] : ['build']

const child = spawn(process.execPath, [viteJs, ...args], {
  stdio: 'inherit',
  env: process.env,
})

child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
