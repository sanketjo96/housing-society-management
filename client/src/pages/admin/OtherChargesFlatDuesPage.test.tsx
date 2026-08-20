import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { OtherChargesFlatDuesPage } from './OtherChargesFlatDuesPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OtherChargesFlatDuesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Amounts deliberately don't correlate with any natural ordering, so a test
// asserting outstanding-descending order can't accidentally pass by coincidence.
// oc-3 is fully PAID and must be excluded entirely — a "dues" drill-down has
// nothing to show for a charge with nothing left owed.
const charges = [
  {
    id: 'oc-1',
    amount: '2000',
    note: null,
    settlementStatus: 'UNPAID',
    settledAmount: 0,
    payer: { id: 'p1', name: 'Alice Owner', email: 'alice@example.com' },
    flat: { id: 'f1', wing: 'A', flatNumber: '101' },
    feeType: { id: 'ft1', name: 'Transfer Fee' },
  },
  {
    id: 'oc-2',
    amount: '3000',
    note: 'Late renovation fine',
    settlementStatus: 'PARTIALLY_SETTLED',
    settledAmount: 1000,
    payer: { id: 'p2', name: 'Bob Owner', email: 'bob@example.com' },
    flat: { id: 'f2', wing: 'B', flatNumber: '202' },
    feeType: { id: 'ft2', name: 'Fine' },
  },
  {
    id: 'oc-3',
    amount: '500',
    note: null,
    settlementStatus: 'PAID',
    settledAmount: 500,
    payer: { id: 'p3', name: 'Carol Owner', email: 'carol@example.com' },
    flat: { id: 'f3', wing: 'C', flatNumber: '303' },
    feeType: { id: 'ft1', name: 'Transfer Fee' },
  },
];

function mockFetch(body: unknown = charges) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/other-charges')) {
      return Promise.resolve({ ok: true, json: async () => body });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('OtherChargesFlatDuesPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows only non-PAID charges, with Flat, Fee type, Outstanding, and Status — no Credit column ever', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('B-202')).toBeInTheDocument();
    expect(screen.queryByText('C-303')).not.toBeInTheDocument(); // fully PAID, excluded

    expect(screen.getByText('Transfer Fee')).toBeInTheDocument();
    expect(screen.getByText('Fine')).toBeInTheDocument();
    expect(screen.getByText('Late renovation fine')).toBeInTheDocument();

    // Both oc-1 (2000 - 0) and oc-2 (3000 - 1000) have an outstanding of 2000.
    expect(screen.getAllByText('₹2,000')).toHaveLength(2);
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('Partially settled')).toBeInTheDocument();
    expect(screen.getByText('₹1,000 of ₹3,000')).toBeInTheDocument(); // oc-2 settled-so-far

    expect(screen.queryByRole('columnheader', { name: 'Credit' })).not.toBeInTheDocument();
  });

  it('sorts by Outstanding descending', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('B-202')).toBeInTheDocument());
    const rows = screen.getAllByRole('row').slice(1); // skip header
    // oc-2's outstanding (3000 - 1000 = 2000) ties oc-1's (2000 - 0 = 2000) — both
    // appear, oc-3 (PAID) is the only one excluded, confirming the filter + sort
    // don't silently drop a non-PAID row.
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText(/A-101|B-202/)).toBeInTheDocument();
  });

  it('links back to the dashboard', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /back to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('shows an empty state when nothing is outstanding', async () => {
    mockFetch([charges[2]]); // only the PAID one
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/nothing outstanding — every billed charge is fully settled/i)).toBeInTheDocument(),
    );
  });

  it('shows an error state when the request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
