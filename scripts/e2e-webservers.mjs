/**
 * Sequential production builds, then two Vite preview servers:
 *   dist          → http://127.0.0.1:4173/              (root app)
 *   dist-pages    → http://127.0.0.1:4174/StrikeCaller/ (Pages base)
 *
 * Builds must not run in parallel: both Vite configs emit to `dist`.
 * dist-pages is deleted before copy so a previous run cannot leave a stale tree.
 */
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import { cpSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteJs = path.resolve(root, 'node_modules/vite/bin/vite.js')
const distDir = path.join(root, 'dist')
const distPages = path.join(root, 'dist-pages')

const APP_URL = 'http://127.0.0.1:4173/'
const PAGES_URL = 'http://127.0.0.1:4174/StrikeCaller/'

function runNpm(script) {
  const result = spawnSync('npm', ['run', script], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function waitForHttp(urlString, timeoutMs) {
  const url = new URL(urlString)
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const attempt = () => {
      const req = http.get(
        {
          hostname: url.hostname,
          port: url.port,
          path: `${url.pathname}${url.search}` || '/',
          timeout: 1000,
        },
        (res) => {
          res.resume()
          if (res.statusCode && res.statusCode < 500) {
            resolve(undefined)
            return
          }
          retry()
        },
      )
      req.on('error', retry)
      req.on('timeout', () => {
        req.destroy()
        retry()
      })
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${urlString}`))
        return
      }
      setTimeout(attempt, 200)
    }
    attempt()
  })
}

function killChild(child) {
  if (!child?.pid || child.killed) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    child.kill('SIGTERM')
  } catch {
    /* already gone */
  }
}

rmSync(distPages, { recursive: true, force: true })
runNpm('build:pages')
rmSync(distPages, { recursive: true, force: true })
cpSync(distDir, distPages, { recursive: true })
runNpm('build')

function preview(port, outDir, base) {
  return spawn(
    process.execPath,
    [
      viteJs,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
      '--outDir',
      outDir,
      '--base',
      base,
    ],
    { cwd: root, stdio: 'inherit', env: process.env },
  )
}

let pages
let app
let shuttingDown = false

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  killChild(pages)
  killChild(app)
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
process.on('SIGHUP', () => shutdown(0))
process.on('exit', () => {
  if (shuttingDown) return
  killChild(pages)
  killChild(app)
})

pages = preview(4174, 'dist-pages', '/StrikeCaller/')
pages.on('exit', (code, signal) => {
  if (shuttingDown) return
  if (signal || code) shutdown(code || 1)
})

await waitForHttp(PAGES_URL, 30_000).catch((error) => {
  console.error(error)
  shutdown(1)
})

app = preview(4173, 'dist', '/')
app.on('exit', (code, signal) => {
  if (shuttingDown) return
  if (signal || code) shutdown(code || 1)
})

console.log(`E2E preview ready: root ${APP_URL} pages ${PAGES_URL}`)
