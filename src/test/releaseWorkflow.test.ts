import { describe, expect, it } from 'vitest'
import packageJsonRaw from '../../package.json?raw'
import ciYml from '../../.github/workflows/ci.yml?raw'
import diagnosticsYml from '../../.github/workflows/pages-diagnostics.yml?raw'

const workflowModules = import.meta.glob('../../.github/workflows/*.{yml,yaml}', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function jobBlock(text: string, jobId: string) {
  const marker = `  ${jobId}:`
  const start = text.indexOf(marker)
  expect(start, `job "${jobId}" should exist`).toBeGreaterThan(-1)
  const rest = text.slice(start + marker.length)
  const next = rest.search(/\n  [A-Za-z0-9_-]+:/)
  return next === -1 ? rest : rest.slice(0, next)
}

const PRODUCTION_IF =
  /github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/

describe('production release workflow gates', () => {
  const workflowEntries = Object.entries(workflowModules).map(([filePath, text]) => ({
    name: filePath.split('/').pop() ?? filePath,
    text,
  }))
  const scripts = (JSON.parse(packageJsonRaw) as { scripts: Record<string, string> }).scripts

  it('keeps a single Pages deploy path in CI', () => {
    expect(workflowEntries.some((w) => w.name === 'ci.yml')).toBe(true)
    expect(workflowEntries.some((w) => w.name === 'deploy-pages.yml')).toBe(false)
    expect(ciYml).toBeTruthy()
    expect(diagnosticsYml).not.toMatch(/actions\/deploy-pages/)
    expect(diagnosticsYml).not.toMatch(/actions\/upload-pages-artifact/)

    const deployFiles = workflowEntries.filter((w) => w.text.includes('actions/deploy-pages'))
    const uploadFiles = workflowEntries.filter((w) => w.text.includes('actions/upload-pages-artifact'))
    expect(deployFiles.map((w) => w.name)).toEqual(['ci.yml'])
    expect(uploadFiles.map((w) => w.name)).toEqual(['ci.yml'])
    expect(ciYml.split('actions/deploy-pages').length - 1).toBe(1)
    expect(ciYml.split('actions/upload-pages-artifact').length - 1).toBe(1)
  })

  it('runs verification, Pages build, and deploy on the production branch and manual dispatch', () => {
    expect(ciYml).toMatch(/on:\s*\n(?:[ \t].*\n)*[ \t]*push:\s*\n(?:[ \t].*\n)*[ \t]*branches:\s*\[main\]/)
    expect(ciYml).toMatch(/pull_request:\s*\n(?:[ \t].*\n)*[ \t]*branches:\s*\[main\]/)
    expect(ciYml).toMatch(/workflow_dispatch:/)
  })

  it('makes deploy depend on E2E and a verified Pages build after unit tests', () => {
    const verify = jobBlock(ciYml, 'verify')
    const e2e = jobBlock(ciYml, 'e2e')
    const pages = jobBlock(ciYml, 'pages')
    const deploy = jobBlock(ciYml, 'deploy')

    expect(verify).toMatch(/npm ci/)
    expect(verify).toMatch(/npm run typecheck/)
    expect(verify).toMatch(/npm test/)
    expect(verify).not.toMatch(/npm install(?:\s|$)/)
    expect(verify).not.toMatch(/playwright/)

    expect(e2e).toMatch(/needs:\s*verify/)
    expect(e2e).toMatch(/npx playwright install --with-deps chromium firefox webkit/)
    expect(e2e).toMatch(/npm run test:e2e/)
    expect(e2e).not.toMatch(/continue-on-error:\s*true/)
    expect(e2e).toMatch(/if:\s*\$\{\{\s*failure\(\)\s*&&\s*!cancelled\(\)\s*\}\}/)
    expect(e2e).toMatch(/if-no-files-found:\s*ignore/)
    expect(e2e).not.toMatch(/video/)
    expect(e2e).toMatch(/actions\/upload-artifact/)

    expect(pages).toMatch(/needs:\s*verify/)
    expect(pages).toMatch(/npm run build:pages/)
    expect(pages).toMatch(/npm run verify:pages/)
    expect(pages).toMatch(/actions\/upload-pages-artifact/)

    const verifyAt = pages.indexOf('npm run verify:pages')
    const uploadAt = pages.indexOf('actions/upload-pages-artifact')
    expect(verifyAt).toBeGreaterThan(-1)
    expect(uploadAt).toBeGreaterThan(verifyAt)

    expect(deploy).toMatch(/needs:\s*\[[^\]]*e2e[^\]]*\]/)
    expect(deploy).toMatch(/needs:\s*\[[^\]]*pages[^\]]*\]/)
    expect(deploy).toMatch(/actions\/deploy-pages/)
    expect(deploy).toMatch(PRODUCTION_IF)
    expect(deploy).toMatch(/environment:[\s\S]*name:\s*github-pages/)
  })

  it('deploys only from main, never from a PR or a feature-branch dispatch', () => {
    const pages = jobBlock(ciYml, 'pages')
    const deploy = jobBlock(ciYml, 'deploy')
    const live = jobBlock(ciYml, 'verify-live')
    const uploadBlock = pages.slice(pages.indexOf('Upload Pages artifact'))
    const configureBlock = pages.slice(pages.indexOf('Configure GitHub Pages'))

    expect(deploy).toMatch(PRODUCTION_IF)
    expect(deploy).toMatch(/github\.ref == 'refs\/heads\/main'/)
    expect(deploy).toMatch(/github\.event_name != 'pull_request'/)
    expect(uploadBlock).toMatch(PRODUCTION_IF)
    expect(configureBlock).toMatch(PRODUCTION_IF)
    expect(live).toMatch(PRODUCTION_IF)

    expect(ciYml).toMatch(/workflow_dispatch:/)
    expect(deploy).not.toMatch(/if:\s*github\.event_name != 'pull_request'\s*$/m)
  })

  it('keeps Pages write and id-token write only on the deploy job', () => {
    const beforeJobs = ciYml.slice(0, ciYml.indexOf('\njobs:'))
    expect(beforeJobs).toMatch(/permissions:\s*\n\s*contents:\s*read/)
    expect(beforeJobs).not.toMatch(/pages:\s*write/)
    expect(beforeJobs).not.toMatch(/id-token:\s*write/)

    const verify = jobBlock(ciYml, 'verify')
    const e2e = jobBlock(ciYml, 'e2e')
    const pages = jobBlock(ciYml, 'pages')
    const deploy = jobBlock(ciYml, 'deploy')

    expect(verify).not.toMatch(/pages:\s*write/)
    expect(verify).not.toMatch(/id-token:\s*write/)
    expect(e2e).not.toMatch(/pages:\s*write/)
    expect(e2e).not.toMatch(/id-token:\s*write/)
    expect(pages).not.toMatch(/pages:\s*write/)
    expect(pages).not.toMatch(/id-token:\s*write/)

    expect(deploy).toMatch(/pages:\s*write/)
    expect(deploy).toMatch(/id-token:\s*write/)
  })

  it('does not continue on error for release gates', () => {
    expect(ciYml).not.toMatch(/continue-on-error:\s*true/)
    expect(jobBlock(ciYml, 'verify')).not.toMatch(/\|\|\s*true/)
    expect(jobBlock(ciYml, 'e2e')).not.toMatch(/\|\|\s*true/)
    expect(jobBlock(ciYml, 'pages')).not.toMatch(/\|\|\s*true/)
    expect(jobBlock(ciYml, 'deploy')).not.toMatch(/\|\|\s*true/)
  })

  it('uses a cross-platform Pages build script and a local release gate', () => {
    expect(scripts['build:pages']).toBe('tsc -b && node scripts/run-pages.mjs build')
    expect(scripts['build:pages']).not.toMatch(/GITHUB_PAGES=true/)
    expect(scripts['preview:pages']).toBe('node scripts/run-pages.mjs preview')
    expect(scripts['verify:release']).toBe(
      'npm run typecheck && npm test && npm run build:pages && npm run verify:pages',
    )
    expect(scripts['verify:release']).not.toMatch(/test:e2e|playwright/)
    expect(scripts['test:e2e']).toBe('playwright test')
  })
})
