import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { FlatWiseDuesPage } from './FlatWiseDuesPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FlatWiseDuesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// flat-2 has nothing outstanding (fully settled) — it must be excluded entirely,
// not shown as a ₹0 row, per the "only residents with outstanding maintenance" rule.
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
  {
    flat: { id: 'flat-3', wing: 'B', flatNumber: '301' },
    owner: { id: 'owner-3', name: 'Dave Owner', email: 'dave@example.com', phone: null },
    currentTenant: null,
    paidTotal: 0,
    outstandingTotal: 2500,
    creditTotal: 0,
  },
];

function mockFetch(body: unknown = flatDues) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/dashboard/flat-dues')) {
      return Promise.resolve({ ok: true, json: async () => body });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('FlatWiseDuesPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows only flats with outstanding maintenance, excluding a fully settled flat', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('B-301')).toBeInTheDocument();
    expect(screen.queryByText('A-102')).not.toBeInTheDocument(); // fully settled, excluded
  });

  it('shows exactly Flat, Owner, and Outstanding Maintenance columns', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Flat' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Owner' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Outstanding Maintenance' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Credit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Paid' })).not.toBeInTheDocument();
  });

  it("indicates a tenant's presence under the owner's name — but only for a listed (still-outstanding) flat", async () => {
    // Swap flat-2's balance so it's outstanding (and thus listed) while keeping its
    // tenant, so the "Tenant: ..." subtext can actually be asserted here.
    mockFetch([{ ...flatDues[1], outstandingTotal: 400 }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Tenant: Carol Tenant')).toBeInTheDocument());
    expect(screen.queryByRole('columnheader', { name: 'Tenant' })).not.toBeInTheDocument();
  });

  it('sorts the table when the Outstanding Maintenance header is clicked', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const table = screen.getByRole('table');

    const rowsBefore = within(table).getAllByRole('row').slice(1); // drop header row
    expect(rowsBefore[0]).toHaveTextContent('A-101');
    expect(rowsBefore[1]).toHaveTextContent('B-301');

    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.click(within(table).getByRole('button', { name: 'Outstanding Maintenance' }));
    const rowsDescending = within(table).getAllByRole('row').slice(1);
    expect(rowsDescending[0]).toHaveTextContent('B-301'); // 2500 > 1500
    expect(rowsDescending[1]).toHaveTextContent('A-101');
  });

  it('links back to the dashboard', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /back to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('shows a relevant empty-state message when nothing is outstanding', async () => {
    mockFetch(flatDues.filter((d) => d.outstandingTotal === 0));
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(/nothing outstanding — every flat's maintenance is fully settled/i),
      ).toBeInTheDocument(),
    );
  });

  it('shows an error state when the request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
