import { test as base, expect } from '@playwright/test'
import { attachErrorWatch } from './errors'
import { seedOnboardingIfMissing, type SeedOptions } from './storage'
import { installBrowserStubs, type StubOptions } from './stubs'

export { expect }

type Fixtures = {
  stubOptions: StubOptions
  seedOptions: SeedOptions
}

export const test = base.extend<Fixtures>({
  stubOptions: [{}, { option: true }],
  seedOptions: [{}, { option: true }],
  page: async ({ page, stubOptions, seedOptions }, use) => {
    const watch = attachErrorWatch(page)
    await installBrowserStubs(page, stubOptions)
    await seedOnboardingIfMissing(page, seedOptions)
    await use(page)
    watch.assertClean()
  },
})
