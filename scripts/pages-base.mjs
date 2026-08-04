// Shared GitHub Pages base-path resolution.
//
// GitHub Pages serves a project site under a case-sensitive path that matches
// the repository name (for this repo: "/StrikeCaller/"). The Vite `base` used
// when building the Pages artifact MUST match that exact path, otherwise the
// emitted <script>/<link> asset URLs 404 and the app renders a blank page.
//
// The canonical Pages URL is provided to the build by GitHub's
// actions/configure-pages step via the PAGES_BASE_URL environment variable.
// We derive the Vite base purely from that URL's pathname — never by guessing
// or re-casing the repository display name.
//
// This module is intentionally dependency-free ESM so it can be shared by
// vite.config.ts, the Pages artifact verifier, and the unit tests.

// Documented local fallback used ONLY when PAGES_BASE_URL is absent (for
// example a local `npm run build:pages`). It matches the canonical Pages URL
// reported by GitHub for this repository: https://manpreets2.github.io/StrikeCaller/
export const LOCAL_PAGES_BASE_FALLBACK = '/StrikeCaller/'

/**
 * Normalize an arbitrary pathname into a Vite `base` with exactly one leading
 * and exactly one trailing slash. A root pathname collapses to "/".
 */
export function normalizePagesBasePath(pathname) {
  const trimmed = String(pathname ?? '').trim()
  if (trimmed === '' || trimmed === '/') return '/'
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const withTrailing = withLeading.endsWith('/') ? withLeading : `${withLeading}/`
  // Collapse any accidental duplicate slashes into a single separator.
  return withTrailing.replace(/\/{2,}/g, '/')
}

/**
 * Resolve the Vite `base` for a build.
 *
 * - Non-Pages builds always use "/".
 * - Pages builds derive the base from PAGES_BASE_URL's pathname.
 * - When PAGES_BASE_URL is absent/unparseable, use the documented local fallback.
 */
export function resolvePagesBase(options = {}) {
  const { isPagesBuild = false, pagesBaseUrl } = options
  if (!isPagesBuild) return '/'

  const raw = typeof pagesBaseUrl === 'string' ? pagesBaseUrl.trim() : ''
  if (raw === '') return LOCAL_PAGES_BASE_FALLBACK

  let pathname
  try {
    // Absolute URL (the normal CI case, e.g. https://user.github.io/Repo/).
    pathname = new URL(raw).pathname
  } catch {
    try {
      // Tolerate a bare pathname by resolving against a dummy origin.
      pathname = new URL(raw, 'https://example.github.io').pathname
    } catch {
      return LOCAL_PAGES_BASE_FALLBACK
    }
  }

  return normalizePagesBasePath(pathname)
}
