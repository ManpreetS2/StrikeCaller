import { Navigate, type RouteObject } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { OnboardingGate } from './components/OnboardingGate'
import { RouteErrorPage } from './pages/RouteErrorPage'
import { HomePage } from './pages/HomePage'
import { OnboardingPage } from './pages/OnboardingPage'
import { TrainPage } from './pages/TrainPage'
import { SessionPage } from './pages/SessionPage'
import { SummaryPage } from './pages/SummaryPage'
import { LearnPage } from './pages/LearnPage'
import { BuilderPage } from './pages/BuilderPage'
import { DailyPage } from './pages/DailyPage'
import { DemoPage } from './pages/DemoPage'
import { SettingsPage } from './pages/SettingsPage'
import { StatsPage } from './pages/StatsPage'

/** Shared route tree used by production (hash) and integration tests (memory). */
export const appRoutes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'onboarding', element: <OnboardingPage /> },
      {
        path: 'train',
        element: (
          <OnboardingGate after="train">
            <TrainPage />
          </OnboardingGate>
        ),
      },
      {
        path: 'learn',
        element: (
          <OnboardingGate after="learn">
            <LearnPage />
          </OnboardingGate>
        ),
      },
      {
        path: 'builder',
        element: (
          <OnboardingGate after="builder">
            <BuilderPage />
          </OnboardingGate>
        ),
      },
      {
        path: 'daily',
        element: (
          <OnboardingGate after="daily">
            <DailyPage />
          </OnboardingGate>
        ),
      },
      { path: 'demo', element: <DemoPage /> },
      {
        path: 'session',
        element: (
          <OnboardingGate after="session">
            <SessionPage />
          </OnboardingGate>
        ),
      },
      { path: 'summary', element: <SummaryPage /> },
      { path: 'summary/:sessionId', element: <SummaryPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
