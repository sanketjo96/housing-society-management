import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordPage } from './ResetPasswordPage';

function renderResetPasswordPage(initialPath = '/reset-password?token=abc123') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/login" element={<div>Login placeholder</div>} />
          <Route path="/forgot-password" element={<div>Forgot password placeholder</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an invalid-link message and no form when the token is missing', () => {
    renderResetPasswordPage('/reset-password');

    expect(screen.getByText(/invalid reset link/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/new password/i)).not.toBeInTheDocument();
  });

  it('submits a matching new password and redirects to /login', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/reset')) {
        return Promise.resolve({ ok: true, json: async () => ({ message: 'Password reset successfully.' }) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderResetPasswordPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/login placeholder/i)).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/reset'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ token: 'abc123', newPassword: 'newpassword123' });
  });

  it('shows a validation error when passwords do not match, without calling the API', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) =>
      Promise.reject(new Error(`Unexpected fetch in this test: ${url}`)),
    );

    renderResetPasswordPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'different123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/do not match/i)).toBeInTheDocument();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an expired/invalid-token error from the server with a link to request a new one', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/reset')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Invalid or expired reset token' }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderResetPasswordPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/new password/i), 'newpassword123');
    await user.type(screen.getByLabelText(/confirm password/i), 'newpassword123');
    await user.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid or expired reset token/i)).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: /request a new link/i })).toBeInTheDocument();
  });
});
