import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { AppLayout } from './components/AppLayout'
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

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { preferences } = useApp()
  if (!preferences.onboardingComplete) {
    return <Navigate to="/onboarding" replace />
  }
  return children
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route
              path="/train"
              element={
                <OnboardingGate>
                  <TrainPage />
                </OnboardingGate>
              }
            />
            <Route path="/learn" element={<LearnPage />} />
            <Route path="/builder" element={<BuilderPage />} />
            <Route path="/daily" element={<DailyPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/session" element={<SessionPage />} />
            <Route path="/summary" element={<SummaryPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </HashRouter>
    </AppProvider>
  )
}
