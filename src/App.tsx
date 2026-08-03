import { createHashRouter, RouterProvider } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { appRoutes } from './routes'

/** Created once outside the React render tree for a stable data-router instance. */
const router = createHashRouter(appRoutes)

export default function App() {
  return (
    <AppProvider>
      <RouterProvider router={router} />
    </AppProvider>
  )
}

export { appRoutes }
