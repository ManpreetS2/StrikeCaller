import {
  expect,
  startShortCoachSession,
  test,
  waitForSessionActive,
  waitForWorkPhase,
} from './helpers/app'

test.describe('active session', () => {
  test('starts a short workout with visible session UX', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'End session' })).toBeVisible()
    await waitForWorkPhase(page)
    await expect(page.getByText('Preparing audio…')).toHaveCount(0)
    const caption = page.locator('.session-call-text')
    await expect(caption).toBeVisible()
    await expect(caption).not.toHaveText('—')
  })

  test('pause and resume keep the session alive', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await page.getByRole('button', { name: 'Pause session' }).click()
    await expect(page.getByRole('button', { name: 'Resume session' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Paused|Interrupted|Get ready/ })).toBeVisible()
    await page.getByRole('button', { name: 'Resume session' }).click()
    await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible()
    await expect(page).toHaveURL(/#\/session/)
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toBeVisible()
  })

  test('skip and repeat progress without breaking the session', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await waitForWorkPhase(page)

    const stats = page.locator('.session-stats')
    await expect(stats).toBeVisible()
    const before = await stats.textContent()
    await page.getByRole('button', { name: 'Skip combination' }).click()
    await expect(page).toHaveURL(/#\/session/)
    await expect(page.getByRole('toolbar', { name: 'Session controls' })).toBeVisible()
    await expect(stats).not.toHaveText(before ?? '')

    await page.getByRole('button', { name: 'Repeat combination' }).click()
    await expect(page.getByRole('button', { name: 'Pause session' })).toBeVisible()
    await expect(page.getByText('Current call')).toBeVisible()
  })
})

test.describe('audio unavailable', () => {
  test.use({ stubOptions: { audio: 'unavailable', speech: 'stub' } })

  test('workout starts on the visual path when AudioContext is missing', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await expect(page.getByText('Preparing audio…')).toHaveCount(0)
    await expect(page.getByText(/Audio unavailable — workout will continue with visual cues/)).toBeVisible()
    await expect(page.getByText('Current call')).toBeVisible()
    await waitForWorkPhase(page)
  })
})

test.describe('speech unavailable', () => {
  test.use({ stubOptions: { audio: 'real', speech: 'unavailable' } })

  test('workout starts with captions when speech synthesis is missing', async ({ page }) => {
    await startShortCoachSession(page)
    await waitForSessionActive(page)
    await expect(page.getByText('Preparing audio…')).toHaveCount(0)
    await expect(
      page.getByText(/Speech synthesis is unavailable in this browser/),
    ).toBeVisible()
    await expect(page.getByText('Current call')).toBeVisible()
    await waitForWorkPhase(page)
    await expect(page.locator('.session-call-text')).not.toHaveText('—')
  })
})
