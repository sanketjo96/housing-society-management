import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

type FetchMock = ReturnType<typeof vi.fn>;

// A stand-in for any page's data query (e.g. ResidentDashboardOverview's
// ['my-ledger', year]) — proves the cache is actually cleared, not just that
// `.clear()` was called in isolation from real query behavior.
function ProbeQuery() {
  const { data } = useQuery({ queryKey: ['probe'], queryFn: () => Promise.resolve('fresh-value') });
  return <div data-testid="probe">{data ?? 'loading'}</div>;
}

// Mirrors ProtectedRoute's real behavior: data-fetching components only mount while
// authenticated, so on logout the query observer unmounts too (not kept alive) —
// matching how ResidentDashboardOverview etc. actually behave under BrowserRouter.
function Harness() {
  const { user, login, logout } = useAuth();
  return (
    <div>
      <div data-testid="user">{user ? user.name : 'anonymous'}</div>
      <button onClick={() => login('owner@example.com', 'password123')}>Log in</button>
      <button onClick={() => logout()}>Log out</button>
      {user && <ProbeQuery />}
    </div>
  );
}

function renderHarness(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Harness />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function mockRefreshAsUnauthenticated(fetchMock: FetchMock, extra?: (url: string) => Response | null) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/auth/refresh')) {
      return Promise.resolve({ ok: false, json: async () => ({ error: 'no session' }) });
    }
    if (url.includes('/api/auth/login')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ accessToken: 'fake-token', user: { id: '1', name: 'Owner One', role: 'OWNER', societyId: 's1' } }),
      });
    }
    if (url.includes('/api/auth/logout')) {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    const forced = extra?.(url);
    if (forced) return Promise.resolve(forced);
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

// Regression coverage for a real bug: an admin approves a payment, logs out, and a
// resident logs back in within the QueryClient's 30s staleTime (App.tsx) — without
// clearing the cache on the auth transition, the resident's queries (e.g.
// ['my-ledger', year]) can still be served stale data left over from before the
// approval, or even from a previous user's session on the same tab.
describe('AuthContext — query cache clearing on auth transitions', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears the QueryClient cache on login, so a freshly-logged-in identity never sees a prior session\'s cached data', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });
    // Simulate stale data left over from whoever used this tab before (e.g. an
    // admin's session, or a previous resident's — the cache has no user-scoping of
    // its own, so this is the only thing standing between one identity's data and
    // the next).
    queryClient.setQueryData(['probe'], 'stale-value-from-before-login');

    const fetchMock = fetch as unknown as FetchMock;
    mockRefreshAsUnauthenticated(fetchMock);

    renderHarness(queryClient);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('anonymous'));
    await user.click(screen.getByText('Log in'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Owner One'));
    // Once logged in, ProbeQuery mounts fresh — if the cache hadn't been cleared,
    // staleTime: 30_000 would let this stale 30-second-old entry serve straight from
    // cache with no refetch at all. Getting 'fresh-value' proves it was actually
    // cleared, not just eventually refetched in the background.
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('fresh-value'));
    expect(queryClient.getQueryData(['probe'])).not.toBe('stale-value-from-before-login');
  });

  it('clears the QueryClient cache on logout, so the outgoing identity\'s cached data never leaks to whoever logs in next', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

    const fetchMock = fetch as unknown as FetchMock;
    mockRefreshAsUnauthenticated(fetchMock);

    renderHarness(queryClient);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('anonymous'));
    await user.click(screen.getByText('Log in'));
    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('Owner One'));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('fresh-value'));

    // Overwrite the cache to simulate this session having fetched real (now
    // out-of-date-once-someone-else-logs-in) data.
    queryClient.setQueryData(['probe'], 'this-users-data');
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('this-users-data'));

    await user.click(screen.getByText('Log out'));

    await waitFor(() => expect(screen.getByTestId('user')).toHaveTextContent('anonymous'));
    expect(queryClient.getQueryData(['probe'])).toBeUndefined();
  });
});
