import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { ProtectedRoute } from './ProtectedRoute';

function renderProtected(initialPath: string, allowedRoles?: ('ADMIN' | 'OWNER' | 'TENANT')[]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<div>Login page placeholder</div>} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute allowedRoles={allowedRoles}>
                  <div>Protected content</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects an unauthenticated user to /login', async () => {
    (fetch as unknown as FetchMock).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Missing refresh token cookie' }),
    });

    renderProtected('/protected');

    await waitFor(() => {
      expect(screen.getByText(/login page placeholder/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/protected content/i)).not.toBeInTheDocument();
  });

  it('shows access-denied for an authenticated user with the wrong role', async () => {
    (fetch as unknown as FetchMock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve({ ok: true, json: async () => ({ accessToken: 'fake-token' }) });
      }
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: '1',
            name: 'Owner User',
            email: 'owner@test.com',
            role: 'OWNER',
            societyId: 's1',
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderProtected('/protected', ['ADMIN']);

    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/protected content/i)).not.toBeInTheDocument();
  });

  it('renders the protected content for an authenticated user with an allowed role', async () => {
    (fetch as unknown as FetchMock).mockImplementation((url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve({ ok: true, json: async () => ({ accessToken: 'fake-token' }) });
      }
      if (url.includes('/api/auth/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: '1',
            name: 'Admin User',
            email: 'admin@test.com',
            role: 'ADMIN',
            societyId: 's1',
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderProtected('/protected', ['ADMIN']);

    await waitFor(() => {
      expect(screen.getByText(/protected content/i)).toBeInTheDocument();
    });
  });
});
