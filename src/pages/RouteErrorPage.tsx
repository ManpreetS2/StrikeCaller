import { isRouteErrorResponse, Link, useNavigate, useRouteError } from 'react-router-dom'

export function RouteErrorPage() {
  const error = useRouteError()
  const navigate = useNavigate()

  if (import.meta.env.DEV) {
    console.error('[StrikeCaller] route error', error)
  }

  let message = 'StrikeCaller encountered an unexpected error.'
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) message = 'That page could not be found.'
    else if (error.statusText) message = 'StrikeCaller encountered an unexpected error.'
  }

  return (
    <div className="app-shell flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="panel mx-auto w-full max-w-md space-y-4 p-5 sm:p-6">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--accent-text)]">Something went wrong</p>
        <h1 className="display text-4xl sm:text-5xl">Unexpected error</h1>
        <p className="text-sm text-[var(--text-muted)] sm:text-base">{message}</p>
        <p className="text-sm text-[var(--text-dim)]">
          You can return home or reload the app. Your local training data on this device is unchanged.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link to="/" className="btn btn-primary">
            Return Home
          </Link>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload app
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Go back
          </button>
        </div>
      </div>
    </div>
  )
}
