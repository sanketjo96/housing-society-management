import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { LoginPage } from './LoginPage';

function renderLoginPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>Dashboard placeholder</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

// AuthProvider always tries POST /api/auth/refresh on mount (silent session
// restore) before LoginPage itself does anything — every test here needs that call
// mocked too, not just the login call the test is actually exercising.
function mockRefreshAsUnauthenticated(fetchMock: FetchMock) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/auth/refresh')) {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'no session' }) });
    }
    return Promise.reject(new Error(`Unexpected fetch in this test: ${url}`));
  });
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('valid credentials call the login API (with credentials: include) and redirect to /dashboard', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'no session' }) });
      }
      if (url.includes('/api/auth/login')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            accessToken: 'fake-token',
            user: { id: '1', name: 'Test User', role: 'OWNER', societyId: 's1' },
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderLoginPage();
    const user = userEvent.setup();

    // Wait for AuthProvider's initial silent-refresh attempt to settle first —
    // otherwise the form submit can race the mount effect.
    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), 'admin@sunrise.test');
    await user.type(screen.getByLabelText(/password/i), 'password123');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/dashboard placeholder/i)).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('invalid credentials show a server error and do not redirect', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/auth/refresh')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'no session' }) });
      }
      if (url.includes('/api/auth/login')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Invalid email or password' }) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderLoginPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), 'admin@sunrise.test');
    await user.type(screen.getByLabelText(/password/i), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/dashboard placeholder/i)).not.toBeInTheDocument();
  });

  it('shows client-side validation errors without calling the login API', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    mockRefreshAsUnauthenticated(fetchMock);

    renderLoginPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    });

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/login'),
      expect.anything(),
    );
  });
});
