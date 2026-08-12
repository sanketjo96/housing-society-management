import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { AdminDashboardPage } from './AdminDashboardPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage(onNavigateToProofs?: () => void) {
  // retry: false — React Query's default retries would otherwise outlast waitFor's
  // default timeout on the error-state test below.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminDashboardPage onNavigateToProofs={onNavigateToProofs} />
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
      return Promise.resolve({ ok: true, json: async () => Array.from({ length: count }, (_, i) => ({ id: `p${i}` })) });
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
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
  });

  it('shows the pending proofs widget with the correct count and navigates on click', async () => {
    mockFetch({ pendingProofsCount: 3 });
    const onNavigate = vi.fn();
    renderPage(onNavigate);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(/3 payment proofs pending review/i)).toBeInTheDocument());
    await user.click(screen.getByText(/3 payment proofs pending review/i));
    expect(onNavigate).toHaveBeenCalled();
  });

  it('uses singular phrasing for exactly one pending proof', async () => {
    mockFetch({ pendingProofsCount: 1 });
    renderPage();

    await waitFor(() => expect(screen.getByText(/1 payment proof pending review/i)).toBeInTheDocument());
  });

  it('shows the flat-wise dues table, including settled flats', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Flat-wise dues')).toBeInTheDocument());
    expect(screen.getByText('A-102')).toBeInTheDocument(); // the ₹0 flat is still listed
  });

  // 'Paid' column hidden for now (AdminDashboardPage.tsx) — re-enable this test
  // alongside that column.
  it.skip('shows how much each flat has paid', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Flat-wise dues')).toBeInTheDocument());
    expect(screen.getByText('₹900')).toBeInTheDocument();
    expect(screen.getByText('₹800')).toBeInTheDocument();
  });

  it('does not show a Paid column for now', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Flat-wise dues')).toBeInTheDocument());
    expect(screen.queryByRole('columnheader', { name: 'Paid' })).not.toBeInTheDocument();
  });

  it('shows each flat\'s available credit, with no separate Tenant/Unpaid columns', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Flat-wise dues')).toBeInTheDocument());
    const section = screen.getByText('Flat-wise dues').closest('div') as HTMLElement;
    expect(within(section).getByText('₹300')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Tenant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Unpaid' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Credit' })).toBeInTheDocument();
  });

  it('shows a Total Credits card summing every flat\'s available credit', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Total Credits')).toBeInTheDocument());
    const card = screen.getByText('Total Credits').closest('div') as HTMLElement;
    expect(within(card).getByText('₹300')).toBeInTheDocument();
  });

  it("indicates a tenant's presence under the owner's name, without a separate Tenant column", async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Flat-wise dues')).toBeInTheDocument());
    expect(screen.getByText('Tenant: Carol Tenant')).toBeInTheDocument();
  });

  it('sorts the flat-wise dues table when a sortable column header is clicked', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Flat-wise dues')).toBeInTheDocument());
    const section = screen.getByText('Flat-wise dues').closest('div') as HTMLElement;

    const rowsBefore = within(section).getAllByRole('row').slice(1); // drop header row
    expect(rowsBefore[0]).toHaveTextContent('A-101');
    expect(rowsBefore[1]).toHaveTextContent('A-102');

    // First click on a numeric column sorts descending (TanStack's default first
    // direction for non-string values) — the ₹1,500 flat (A-101) stays on top.
    await userEvent.click(within(section).getByRole('button', { name: 'Outstanding' }));
    const rowsDescending = within(section).getAllByRole('row').slice(1);
    expect(rowsDescending[0]).toHaveTextContent('A-101');
    expect(rowsDescending[1]).toHaveTextContent('A-102');

    // Second click reverses to ascending — the ₹0 flat (A-102) now leads.
    await userEvent.click(within(section).getByRole('button', { name: 'Outstanding' }));
    const rowsAscending = within(section).getAllByRole('row').slice(1);
    expect(rowsAscending[0]).toHaveTextContent('A-102');
    expect(rowsAscending[1]).toHaveTextContent('A-101');
  });

  it('shows an error state when a request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
