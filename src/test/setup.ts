import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import { resetStorageAvailabilityCache } from '../storage/localStore'

beforeEach(() => {
  resetStorageAvailabilityCache()
})
