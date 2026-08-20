import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { ResidentLedgerPage } from './ResidentLedgerPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResidentLedgerPage />
    </QueryClientProvider>,
  );
}

// flat-2 is fully settled on both pools — unlike /flat-dues and /other-charges-dues
// (both filtered to only what's owed), this "manage" page must still list it.
const rows = [
  {
    flat: { id: 'flat-1', wing: 'A', flatNumber: '101' },
    owner: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com', phone: null },
    currentTenant: null,
    outstandingMaintenance: 1500,
    paidMaintenance: 900,
    creditMaintenance: 0,
    outstandingOtherCharges: 2000,
  },
  {
    flat: { id: 'flat-2', wing: 'A', flatNumber: '102' },
    owner: { id: 'owner-2', name: 'Bob Owner', email: 'bob@example.com', phone: null },
    currentTenant: { id: 'tenant-2', name: 'Carol Tenant', email: 'carol@example.com', phone: null },
    outstandingMaintenance: 0,
    paidMaintenance: 800,
    creditMaintenance: 300,
    outstandingOtherCharges: 0,
  },
];

function mockFetch(body: unknown = rows) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/dashboard/resident-ledger')) {
      return Promise.resolve({ ok: true, json: async () => body });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('ResidentLedgerPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('lists every flat, including one fully settled on both pools', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('A-102')).toBeInTheDocument(); // fully settled, still listed
  });

  it('shows Flat, Owner, Outstanding Maintenance, Paid Maintenance, Credit Maintenance, and Outstanding Other Charge columns', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Flat' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Outstanding Maintenance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Paid Maintenance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Credit Maintenance' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Outstanding Other Charge' })).toBeInTheDocument();

    expect(screen.getByText('₹1,500')).toBeInTheDocument();
    expect(screen.getByText('₹900')).toBeInTheDocument();
    expect(screen.getByText('₹300')).toBeInTheDocument();
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
  });

  it("indicates a tenant's presence under the owner's name", async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Tenant: Carol Tenant')).toBeInTheDocument());
  });

  it('shows an empty state when there are no flats', async () => {
    mockFetch([]);
    renderPage();

    await waitFor(() => expect(screen.getByText(/no flats yet/i)).toBeInTheDocument());
  });

  it('shows an error state when the request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
