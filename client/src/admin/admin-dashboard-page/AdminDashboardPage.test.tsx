import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  availableYears: [2026, 2025],
  openComplaintsCount: 2,
  complaintCountsByStatus: { OPEN: 2, IN_PROGRESS: 1, RESOLVED: 3, REJECTED: 1 },
};

// Distinct figures from `summary` above, returned only when the request asks for
// year=2025 — lets a test tell "the year-scoped fetch happened" apart from "the
// lifetime one did."
const summary2025 = { ...summary, outstandingTotal: 700, societyTotalIncome: 1200 };

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
      const body = url.includes('year=2025') ? summary2025 : summary;
      return Promise.resolve({ ok: true, json: async () => body });
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

  it('shows Total Income (already inclusive of paid maintenance, per the backend) with an explanatory note', async () => {
    mockFetch();
    renderPage();

    // The backend's societyTotalIncome is already societyLedgerTotals.totalIncome +
    // totalPaid — the card just displays it as-is, no client-side arithmetic.
    await waitFor(() => expect(screen.getByText('₹5,000')).toBeInTheDocument());
    expect(screen.getByText('Society income recorded + paid maintenance.')).toBeInTheDocument();
  });

  it('shows the summary cards', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());
  });

  it('shows an Open Complaints card under Society, deep-linking to the complaints page', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /open complaints/i });
    expect(link).toHaveAttribute('href', '/admin/complaints');
    expect(within(link).getByText('2')).toBeInTheDocument();
  });

  it('no longer shows a standalone Complaints card group', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Society')).toBeInTheDocument());
    expect(screen.queryByText(/^complaints$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
    expect(screen.queryByText('Resolved')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
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

  it('links all three Outstanding tiles to the resident book', async () => {
    mockFetch();
    renderPage();

    expect(await screen.findByRole('link', { name: /total outstanding/i })).toHaveAttribute(
      'href',
      '/resident-ledger',
    );
    expect(screen.getByRole('link', { name: /maintenance outstanding total/i })).toHaveAttribute(
      'href',
      '/resident-ledger',
    );
    expect(screen.getByRole('link', { name: /other charges outstanding total/i })).toHaveAttribute(
      'href',
      '/resident-ledger',
    );
  });

  // docs/features/other-charges/ — a fully separate pool: its own card, plus a Total that
  // combines both, never displayed as the same figure as maintenance alone.
  it('shows the Other Charges Outstanding and Total Outstanding cards, independent of the maintenance figure', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹900')).toBeInTheDocument());
    expect(screen.getByText('₹3,600')).toBeInTheDocument();
    // The maintenance-only figure is still shown separately, unmerged.
    expect(screen.getByText('₹2,700')).toBeInTheDocument();
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

  it('no longer shows a Total Maintenance Credit card', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Maintenance Outstanding Total')).toBeInTheDocument());
    expect(screen.queryByText('Total Maintenance Credit')).not.toBeInTheDocument();
  });

  it('groups the cards into Finance, Outstanding, and Society containers', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Finance')).toBeInTheDocument());
    expect(screen.getByText('Outstanding')).toBeInTheDocument();
    expect(screen.getByText('Society')).toBeInTheDocument();
    // "Society Finance" was merged into "Finance" — no separate heading remains.
    expect(screen.queryByText('Society Finance')).not.toBeInTheDocument();
    // Maintenance and Other Charges are no longer separate group headings — both
    // outstanding-total cards live inside the merged "Outstanding" group instead.
    expect(screen.queryByText('Maintenance')).not.toBeInTheDocument();
    expect(screen.queryByText('Other Charges')).not.toBeInTheDocument();
    // Maintenance Collection Rate was dropped entirely, not just relocated.
    expect(screen.queryByText('Maintenance Collection Rate')).not.toBeInTheDocument();

    // Finance's heading and its 3 cards (the former Society Finance income/expense/
    // net cards) live in the same container — Total Outstanding moved out to the
    // Outstanding group.
    const financeGroup = screen.getByText('Finance').closest('div')!.parentElement!;
    expect(within(financeGroup).getByText('Total Income')).toBeInTheDocument();
    expect(within(financeGroup).getByText('Total Expense')).toBeInTheDocument();
    expect(within(financeGroup).getByText('Net')).toBeInTheDocument();
    expect(within(financeGroup).queryByText('Total Outstanding')).not.toBeInTheDocument();

    // Society's heading and its 4 cards (including the relocated Open
    // Complaints tile) live in the same container.
    const societyGroup = screen.getByText('Society').closest('div')!.parentElement!;
    expect(within(societyGroup).getByText('Total Owners')).toBeInTheDocument();
    expect(within(societyGroup).getByText('Total Flats')).toBeInTheDocument();
    expect(within(societyGroup).getByText('Total Tenants')).toBeInTheDocument();
    expect(within(societyGroup).getByText('Open Complaints')).toBeInTheDocument();
    expect(within(societyGroup).queryByText('Total Outstanding')).not.toBeInTheDocument();

    // Outstanding's heading and all three of its cards (the combined Total
    // Outstanding plus its Maintenance and Other Charges pools) live in the same
    // container — no separate Credit card, per the 2026-08-24 change.
    const outstandingGroup = screen.getByText('Outstanding').closest('div')!.parentElement!;
    expect(within(outstandingGroup).getByText('Total Outstanding')).toBeInTheDocument();
    expect(within(outstandingGroup).getByText('Maintenance Outstanding Total')).toBeInTheDocument();
    expect(within(outstandingGroup).getByText('Other Charges Outstanding Total')).toBeInTheDocument();
    expect(within(outstandingGroup).queryByText('Total Maintenance Credit')).not.toBeInTheDocument();
  });

  it('orders the cards: pending-proofs widget, Finance, Outstanding (incl. combined total), Society', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Total Outstanding')).toBeInTheDocument());
    const labels = [
      'payment proof', // the pending-proofs widget, at the very top of the dashboard
      'Total Income',
      'Total Expense',
      'Net',
      'Total Outstanding',
      'Maintenance Outstanding Total',
      'Other Charges Outstanding Total',
      'Total Owners',
      'Total Flats',
      'Total Tenants',
      'Open Complaints',
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

  it('shows a Year dropdown defaulting to "All", listing availableYears', async () => {
    mockFetch();
    renderPage();

    const select = await screen.findByLabelText('Year');
    expect(select).toHaveValue('ALL');
    expect(within(select).getByRole('option', { name: 'All' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '2026' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '2025' })).toBeInTheDocument();
  });

  it('selecting a year re-fetches the summary scoped to that year, and Finance/Outstanding cards update', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Year'), '2025');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/dashboard/summary?year=2025'),
        expect.anything(),
      );
    });
    await waitFor(() => expect(screen.getByText('₹700')).toBeInTheDocument());
    expect(screen.queryByText('₹2,700')).not.toBeInTheDocument();
  });

  it('switching back to "All" re-fetches the lifetime summary with no year param', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Year'), '2025');
    await waitFor(() => expect(screen.getByText('₹700')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Year'), 'All');
    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());

    const summaryCalls = (fetch as unknown as FetchMock).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((url: string) => url.includes('/api/admin/dashboard/summary'));
    expect(summaryCalls.some((url: string) => !url.includes('year='))).toBe(true);
  });

  it('the year selection never affects Total Owners/Flats/Tenants — flat-dues is never fetched with a year param', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Total Flats')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Year'), '2025');
    await waitFor(() => expect(screen.getByText('₹700')).toBeInTheDocument());

    expect(screen.getByText('Total Owners').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Total Tenants').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Total Flats').nextSibling).toHaveTextContent('2');

    const duesCalls = (fetch as unknown as FetchMock).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((url: string) => url.includes('/api/admin/dashboard/flat-dues'));
    expect(duesCalls.every((url: string) => !url.includes('year='))).toBe(true);
  });

  it('shows an error state when a request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
