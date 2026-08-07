import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { MaintenanceBookPage } from './MaintenanceBookPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MaintenanceBookPage />
    </QueryClientProvider>,
  );
}

// Amounts deliberately don't correlate with date order, so a test asserting
// amount-sorted output can't accidentally pass just because it matches date order.
// totals.totalCharges (6500) intentionally excludes the DEPOSIT row (4000) — only
// SYSTEM charges count toward it. settlementStatus/settledAmount mix all three states
// so the badge/amount rendering can be asserted per-row.
const ledger = {
  entries: [
    {
      id: 'sys-1',
      type: 'SYSTEM',
      period: '2026-01',
      date: '2026-01-01T00:00:00.000Z',
      amount: 1500,
      settledAmount: 1500,
      settlementStatus: 'PAID',
    },
    {
      id: 'sys-2',
      type: 'SYSTEM',
      period: '2026-03',
      date: '2026-03-01T00:00:00.000Z',
      amount: 2000,
      settledAmount: 0,
      settlementStatus: 'UNPAID',
    },
    {
      id: 'sys-3',
      type: 'SYSTEM',
      period: '2026-02',
      date: '2026-02-01T00:00:00.000Z',
      amount: 3000,
      settledAmount: 900,
      settlementStatus: 'PARTIALLY_SETTLED',
    },
    { id: 'dep-1', type: 'DEPOSIT', date: '2026-06-18T00:00:00.000Z', amount: 4000 },
  ],
  totals: { totalCharges: 6500 },
};

function mockFetch() {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/me/ledger')) {
      return Promise.resolve({ ok: true, json: async () => ledger });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

function rowTexts() {
  const rows = screen.getAllByRole('row').slice(1); // skip header row
  return rows.map((row) => within(row).getAllByRole('cell').map((c) => c.textContent));
}

describe('MaintenanceBookPage', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows only SYSTEM charges, not Deposit/Credit rows, each with its own settlement status', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    expect(screen.getByText('Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('Feb 2026')).toBeInTheDocument();
    expect(screen.queryByText('₹4,000')).not.toBeInTheDocument(); // the DEPOSIT row's amount

    expect(screen.getByText('Paid')).toBeInTheDocument(); // Jan, fully settled
    expect(screen.getByText('Unpaid')).toBeInTheDocument(); // Mar, untouched
    expect(screen.getByText('Partially settled')).toBeInTheDocument(); // Feb
    expect(screen.getByText('₹900 of ₹3,000')).toBeInTheDocument(); // Feb's settled-so-far
  });

  it('sorts by date descending by default, newest first', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    expect(rowTexts().map((r) => r[0])).toEqual(['Mar 2026', 'Feb 2026', 'Jan 2026']);
  });

  it('toggles date sort order on header click', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^date/i }));

    await waitFor(() => expect(rowTexts().map((r) => r[0])).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026']));
  });

  it('sorts by amount when the Amount header is clicked', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^amount/i }));

    // Descending by amount (3000, 2000, 1500) = Feb, Mar, Jan — distinct from both
    // date orderings, proving this sorts by amount and not date.
    await waitFor(() => expect(rowTexts().map((r) => r[0])).toEqual(['Feb 2026', 'Mar 2026', 'Jan 2026']));
  });

  it('filters by date range', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    await user.type(screen.getByLabelText('From'), '2026-02-01');

    await waitFor(() => {
      expect(screen.queryByText('Jan 2026')).not.toBeInTheDocument();
      expect(screen.getByText('Feb 2026')).toBeInTheDocument();
      expect(screen.getByText('Mar 2026')).toBeInTheDocument();
    });
  });

  it('shows an empty state when there are no SYSTEM records', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/me/ledger')) {
        return Promise.resolve({ ok: true, json: async () => ({ entries: [], totals: { totalCharges: 0 } }) });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no maintenance records yet/i)).toBeInTheDocument());
  });

  it('shows a "Total maintenance amount" card at the top, from the lifetime totals (excludes the DEPOSIT row)', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/total maintenance amount/i)).toBeInTheDocument());
    expect(screen.getByText('₹6,500')).toBeInTheDocument();
  });

  it('has no year selector and no bottom total row', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    expect(screen.queryByLabelText('Year')).not.toBeInTheDocument();
    // "Total maintenance amount" appears once (the top card) — no second "Total"
    // row at the bottom.
    expect(screen.getAllByText('₹6,500').length).toBe(1);
  });
});
