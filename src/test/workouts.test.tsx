import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from '../context/AppContext'
import { BuilderPage } from '../pages/BuilderPage'
import { TrainPage } from '../pages/TrainPage'
import { OnboardingPage } from '../pages/OnboardingPage'
import { LearnPage } from '../pages/LearnPage'
import { DailyPage } from '../pages/DailyPage'
import { DemoPage } from '../pages/DemoPage'

function wrap(ui: React.ReactNode, route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProvider>
        <Routes>
          <Route path="*" element={ui} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  )
}

describe('workout surfaces', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders Learn Mode', () => {
    wrap(<LearnPage />)
    expect(screen.getByRole('heading', { name: /learn mode/i })).toBeInTheDocument()
  })

  it('renders Train Mode choices including Coach and Round and Reaction', () => {
    wrap(<TrainPage />)
    expect(screen.getByRole('heading', { name: /customize workout/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /coach mode/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /round mode/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /reaction mode/i })).toBeInTheDocument()
  })

  it('renders Daily Drill', () => {
    wrap(<DailyPage />)
    expect(screen.getByRole('heading', { name: /daily drill/i })).toBeInTheDocument()
  })

  it('renders Custom Combo Builder and validates', async () => {
    const user = userEvent.setup()
    wrap(<BuilderPage />)
    expect(screen.getByRole('heading', { name: /custom combo builder/i })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^jab$/i }))
    expect(screen.getByRole('button', { name: /save combo/i })).toBeEnabled()
  })

  it('renders Guided Demo', () => {
    wrap(<DemoPage />)
    expect(screen.getByRole('button', { name: /start guided demo/i })).toBeInTheDocument()
  })

  it('onboarding starts with martial art and can skip remaining defaults', async () => {
    const user = userEvent.setup()
    wrap(<OnboardingPage />)
    expect(screen.getByRole('heading', { name: /four quick choices/i })).toBeInTheDocument()
    expect(screen.getByText(/1\. Martial art/i)).toBeInTheDocument()
    expect(screen.getByText(/2\. Stance/i)).toBeInTheDocument()
    expect(screen.getByText(/3\. Experience/i)).toBeInTheDocument()
    expect(screen.getByText(/4\. Calling style/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /skip remaining/i }))
  })
})
