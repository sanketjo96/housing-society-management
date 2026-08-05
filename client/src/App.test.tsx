import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    // AuthProvider tries POST /api/auth/refresh on mount (silent session restore) —
    // simulate "no valid session" so the redirect-to-login behavior can be observed.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'no session' }) }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('redirects to the login page by default', async () => {
    render(<App />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument()
    })
  })
})
