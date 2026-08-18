import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { AdminDashboardPage } from './AdminDashboardPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AdminDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Deliberately distinct from flatDues' amounts below, so assertions can use
// exact-text queries without colliding with a per-flat figure that happens to
// share the same number.
const summary = { totalBilled: 4700, totalPaid: 2000, outstandingTotal: 2700, pendingReviewTotal: 2000, collectionRatePercent: 23 };

const flatDues = [
  {
    flat: { id: 'flat-1', wing: 'A', flatNumber: '101' },
    owner: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com', phone: null },
    currentTenant: null,
    paidTotal: 900,
    outstandingTotal: 1500,
    creditTotal: 0,
  },
  {
    flat: { id: 'flat-2', wing: 'A', flatNumber: '102' },
    owner: { id: 'owner-2', name: 'Bob Owner', email: 'bob@example.com', phone: null },
    currentTenant: { id: 'tenant-2', name: 'Carol Tenant', email: 'carol@example.com', phone: null },
    paidTotal: 800,
    outstandingTotal: 0,
    creditTotal: 300,
  },
];

function mockFetch(overrides: Partial<{ pendingProofsCount: number }> = {}) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/dashboard/summary')) {
      return Promise.resolve({ ok: true, json: async () => summary });
    }
    if (url.includes('/api/admin/dashboard/flat-dues')) {
      return Promise.resolve({ ok: true, json: async () => flatDues });
    }
    if (url.includes('/api/admin/ledger-entries')) {
      const count = overrides.pendingProofsCount ?? 3;
      return Promise.resolve({
        ok: true,
        json: async () => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, fileUrl: `proofs/p${i}.jpg` })),
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows the summary cards', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());
    expect(screen.getByText('23%')).toBeInTheDocument();
  });

  it('no longer shows the numeric "Pending review" amount card', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());
    expect(screen.queryByText(/^pending review$/i)).not.toBeInTheDocument();
  });

  it('shows the pending proofs widget with the correct count, linking to Payment proofs', async () => {
    mockFetch({ pendingProofsCount: 3 });
    renderPage();

    const link = await screen.findByRole('link', { name: /3 payment proofs pending review/i });
    expect(link).toHaveAttribute('href', '/payment-proofs');
  });

  it('excludes fileless entries (e.g. manually marked paid) from the pending proofs count', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/dashboard/summary')) {
        return Promise.resolve({ ok: true, json: async () => summary });
      }
      if (url.includes('/api/admin/dashboard/flat-dues')) {
        return Promise.resolve({ ok: true, json: async () => flatDues });
      }
      if (url.includes('/api/admin/ledger-entries')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'p1', fileUrl: 'proofs/p1.jpg' },
            { id: 'p2', fileUrl: null },
          ],
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    renderPage();

    const link = await screen.findByRole('link', { name: /1 payment proof pending review/i });
    expect(link).toHaveAttribute('href', '/payment-proofs');
  });

  it('uses singular phrasing for exactly one pending proof', async () => {
    mockFetch({ pendingProofsCount: 1 });
    renderPage();

    await waitFor(() => expect(screen.getByText(/1 payment proof pending review/i)).toBeInTheDocument());
  });

  it('does not render the flat-wise dues table on this page', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('links the Outstanding tile to the flat-wise dues page', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /maintenance outstanding total/i });
    expect(link).toHaveAttribute('href', '/flat-dues');
  });

  it('links the Total Owners tile to the flats and residents page', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /total owners/i });
    expect(link).toHaveAttribute('href', '/flats');
  });

  it('links the Total Flats tile to the flats and residents page', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /total flats/i });
    expect(link).toHaveAttribute('href', '/flats');
  });

  it('links the Total Tenants tile to the tenants page', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /total tenants/i });
    expect(link).toHaveAttribute('href', '/tenants');
  });

  it('shows a Total Credits card summing every flat\'s available credit', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Total Credits')).toBeInTheDocument());
    const card = screen.getByText('Total Credits').closest('a,div') as HTMLElement;
    expect(card).toHaveTextContent('₹300');
  });

  it('shows Total Owners, Total Tenants, and Total Flats counts', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Total Flats')).toBeInTheDocument());
    expect(screen.getByText('Total Owners').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Total Tenants').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Total Flats').nextSibling).toHaveTextContent('2');
  });

  it('shows an error state when a request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
