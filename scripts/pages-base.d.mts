export const LOCAL_PAGES_BASE_FALLBACK: string

export function normalizePagesBasePath(pathname: string | null | undefined): string

export function resolvePagesBase(options?: {
  isPagesBuild?: boolean
  pagesBaseUrl?: string | null | undefined
}): string
