import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { TenantsListPage } from './TenantsListPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TenantsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const flats = [
  {
    id: 'flat-1',
    wing: 'A',
    flatNumber: '101',
    currentTenant: null,
  },
  {
    id: 'flat-2',
    wing: 'A',
    flatNumber: '102',
    currentTenant: { id: 'tenant-2', name: 'Carol Tenant', email: 'carol@example.com', phone: '9876543210' },
  },
];

function mockFetch() {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/flats')) {
      return Promise.resolve({ ok: true, json: async () => flats });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('TenantsListPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('lists only tenant-occupied flats, not owner-occupied ones', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Carol Tenant')).toBeInTheDocument());
    expect(screen.getByText('A-102')).toBeInTheDocument();
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
  });

  it("shows the tenant's contact details", async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Carol Tenant')).toBeInTheDocument());
    expect(screen.getByText('carol@example.com')).toBeInTheDocument();
    expect(screen.getByText('9876543210')).toBeInTheDocument();
  });

  it('links back to the dashboard', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /back to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('shows an empty state when no flat has a tenant', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => [flats[0]] });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no tenant-occupied flats/i)).toBeInTheDocument());
  });

  it('shows an error state when the request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
