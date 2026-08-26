import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from './ForgotPasswordPage';

function renderForgotPasswordPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<div>Login placeholder</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits a valid email and shows the generic success message', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/request-reset')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: 'If that email exists, a reset link has been sent.' }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderForgotPasswordPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'resident@sunrise.test');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/check your email/i)).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/request-reset'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('shows client-side validation errors without calling the API', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) =>
      Promise.reject(new Error(`Unexpected fetch in this test: ${url}`)),
    );

    renderForgotPasswordPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a server error banner on failure and stays on the form', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/request-reset')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Something broke' }) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderForgotPasswordPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/email/i), 'resident@sunrise.test');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/something broke/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });
});
