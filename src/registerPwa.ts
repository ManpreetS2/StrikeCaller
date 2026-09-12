export function serviceWorkerRegistrationUrls(baseUrl: string): { scriptUrl: string; scope: string } {
  const scope = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return {
    scriptUrl: `${scope}sw.js`,
    scope,
  }
}

/**
 * Production-only service-worker registration.
 *
 * The waiting worker is never skipped while a tab is open, so an active workout
 * is not reloaded because a newer build exists. Training data lives in
 * IndexedDB and localStorage, not Cache Storage.
 */
export function registerPwa(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const { scriptUrl, scope } = serviceWorkerRegistrationUrls(import.meta.env.BASE_URL)

  const register = () => {
    void navigator.serviceWorker.register(scriptUrl, { scope }).catch(() => {
      // Offline install is optional. Local workout data does not depend on it.
    })
  }

  if (document.readyState === 'complete') {
    register()
    return
  }

  window.addEventListener('load', register, { once: true })
}
