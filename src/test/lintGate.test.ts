/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import packageJsonRaw from '../../package.json?raw'
import ciYml from '../../.github/workflows/ci.yml?raw'

function jobBlock(text: string, jobId: string) {
  const marker = `  ${jobId}:`
  const start = text.indexOf(marker)
  expect(start, `job "${jobId}" should exist`).toBeGreaterThan(-1)
  const rest = text.slice(start + marker.length)
  const next = rest.search(/\n  [A-Za-z0-9_-]+:/)
  return next === -1 ? rest : rest.slice(0, next)
}

describe('lint release gate', () => {
  const scripts = (JSON.parse(packageJsonRaw) as { scripts: Record<string, string> }).scripts

  it('fails the process when Oxlint reports a warning', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'strikecaller-lint-'))
    const file = path.join(dir, 'Warn.tsx')
    writeFileSync(
      file,
      `export function helper() {\n  return 1\n}\nexport function Warn() {\n  return null\n}\n`,
    )
    try {
      const result = spawnSync(
        process.execPath,
        [
          path.join(process.cwd(), 'node_modules', 'oxlint', 'bin', 'oxlint'),
          '--deny-warnings',
          '-c',
          path.join(process.cwd(), '.oxlintrc.json'),
          file,
        ],
        { encoding: 'utf8' },
      )
      expect(result.status).not.toBe(0)
      expect(`${result.stdout}\n${result.stderr}`).toMatch(/only-export-components|Warn/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps lint as a blocking verify step that deploy cannot skip', () => {
    expect(scripts.lint).toContain('--deny-warnings')
    expect(scripts['verify:release']).toMatch(/^npm run lint &&/)
    expect(scripts['verify:release']).not.toMatch(/lint.*verify:release|verify:release.*lint.*verify:release/)

    const verify = jobBlock(ciYml, 'verify')
    const e2e = jobBlock(ciYml, 'e2e')
    const pages = jobBlock(ciYml, 'pages')
    const deploy = jobBlock(ciYml, 'deploy')

    expect(verify).toMatch(/npm run lint/)
    expect(verify).not.toMatch(/continue-on-error/)
    expect(e2e).toMatch(/needs:\s*verify/)
    expect(pages).toMatch(/needs:\s*verify/)
    expect(deploy).toMatch(/needs:\s*\[[^\]]*e2e[^\]]*\]/)
    expect(deploy).toMatch(/needs:\s*\[[^\]]*pages[^\]]*\]/)
  })
})
