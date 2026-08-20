import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
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
const summary = {
  totalBilled: 4700,
  totalPaid: 2000,
  outstandingTotal: 2700,
  pendingReviewTotal: 2000,
  collectionRatePercent: 23,
  otherChargesOutstandingTotal: 900,
  totalOutstandingTotal: 3600,
  societyTotalIncome: 5000,
  societyTotalExpense: 3200,
  societyNetPosition: 1800,
};

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

  // docs/other-charges/ — a fully separate pool: its own card, plus a Total that
  // combines both, never displayed as the same figure as maintenance alone.
  it('shows the Other Charges Outstanding and Total Outstanding cards, independent of the maintenance figure', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹900')).toBeInTheDocument());
    expect(screen.getByText('₹3,600')).toBeInTheDocument();
    // The maintenance-only figure is still shown separately, unmerged.
    expect(screen.getByText('₹2,700')).toBeInTheDocument();

    // Links to the read-only flat-wise dues table, not the /other-charges billing
    // page (deliberately unlinked from the Dashboard card, per the admin nav
    // restructure — that page is reached via the sidebar's "Custom Bills" instead).
    const link = await screen.findByRole('link', { name: /other charges outstanding total/i });
    expect(link).toHaveAttribute('href', '/other-charges-dues');
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

  it('shows a Total Maintenance Credit card summing every flat\'s available credit', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Total Maintenance Credit')).toBeInTheDocument());
    const card = screen.getByText('Total Maintenance Credit').closest('a,div') as HTMLElement;
    expect(card).toHaveTextContent('₹300');
  });

  it('groups the cards into Finance, Maintenance, Other Charges, and Society containers', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Finance')).toBeInTheDocument());
    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Other Charges')).toBeInTheDocument();
    expect(screen.getByText('Society')).toBeInTheDocument();
    // "Society Finance" was merged into "Finance" — no separate heading remains.
    expect(screen.queryByText('Society Finance')).not.toBeInTheDocument();
    // Maintenance Collection Rate was dropped entirely, not just relocated.
    expect(screen.queryByText('Maintenance Collection Rate')).not.toBeInTheDocument();

    // Finance's heading and its 4 cards (dues Outstanding + the former Society
    // Finance income/expense/net cards) live in the same container.
    const financeGroup = screen.getByText('Finance').closest('div')!.parentElement!;
    expect(within(financeGroup).getByText('Total Outstanding')).toBeInTheDocument();
    expect(within(financeGroup).getByText('Total Income')).toBeInTheDocument();
    expect(within(financeGroup).getByText('Total Expense')).toBeInTheDocument();
    expect(within(financeGroup).getByText('Net')).toBeInTheDocument();

    // Society's heading and its 3 cards live in the same container.
    const societyGroup = screen.getByText('Society').closest('div')!.parentElement!;
    expect(within(societyGroup).getByText('Total Owners')).toBeInTheDocument();
    expect(within(societyGroup).getByText('Total Flats')).toBeInTheDocument();
    expect(within(societyGroup).getByText('Total Tenants')).toBeInTheDocument();
    expect(within(societyGroup).queryByText('Total Outstanding')).not.toBeInTheDocument();

    // Maintenance's heading and its 2 cards (Outstanding + Credit only) live in the
    // same container, separate from Other Charges' single card.
    const maintenanceGroup = screen.getByText('Maintenance').closest('div')!.parentElement!;
    expect(within(maintenanceGroup).getByText('Maintenance Outstanding Total')).toBeInTheDocument();
    expect(within(maintenanceGroup).getByText('Total Maintenance Credit')).toBeInTheDocument();
    expect(within(maintenanceGroup).queryByText('Other Charges Outstanding Total')).not.toBeInTheDocument();
  });

  it('orders the cards: pending-proofs widget, Finance (incl. society income/expense), Maintenance, Other Charges, Society', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Total Outstanding')).toBeInTheDocument());
    const labels = [
      'payment proof', // the pending-proofs widget, at the very top of the dashboard
      'Total Outstanding',
      'Total Income',
      'Total Expense',
      'Net',
      'Maintenance Outstanding Total',
      'Total Maintenance Credit',
      'Other Charges Outstanding Total',
      'Total Owners',
      'Total Flats',
      'Total Tenants',
    ];
    const elements = labels.map((label) => screen.getByText(new RegExp(label, 'i')));
    for (let i = 0; i < elements.length - 1; i++) {
      // DOCUMENT_POSITION_FOLLOWING (4) means the next element comes after the
      // current one in the DOM.
      // eslint-disable-next-line no-bitwise
      expect(elements[i].compareDocumentPosition(elements[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
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
