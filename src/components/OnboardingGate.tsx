import { Navigate, useLocation } from 'react-router-dom'
import { useApp } from '../context/useApp'

export function OnboardingGate({
  children,
  after,
}: {
  children: React.ReactNode
  after: 'train' | 'session' | 'daily' | 'learn' | 'builder'
}) {
  const { preferences } = useApp()
  const location = useLocation()
  if (!preferences.onboardingComplete) {
    return <Navigate to="/onboarding" replace state={{ after, from: location.pathname }} />
  }
  return children
}
