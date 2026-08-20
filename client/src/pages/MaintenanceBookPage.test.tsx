import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { MaintenanceBookPage } from './MaintenanceBookPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MaintenanceBookPage />
      </MemoryRouter>
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
    {
      id: 'dep-1',
      type: 'DEPOSIT',
      date: '2026-06-18T00:00:00.000Z',
      amount: 4000,
      status: 'APPROVED',
      hasReceipt: true,
    },
  ],
  totals: { totalCharges: 6500, outstanding: 1100 },
};

function mockFetch(ledgerBody: unknown = ledger, openIntent: unknown = null) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/me/ledger/deposits/intent/submit')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: 'dep-new', status: 'PENDING' }) });
    }
    if (url.includes('/api/me/ledger/deposits/intent') && init?.method === 'DELETE') {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes('/api/me/ledger/deposits/intent') && init?.method === 'POST') {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          intent: {
            id: 'intent-1',
            amount: 1100,
            paymentMethod: 'UPI',
            upiLink: 'upi://pay?x',
            qrDataUrl: 'data:image/png;base64,abc',
            category: 'MAINTENANCE',
          },
        }),
      });
    }
    if (url.includes('/api/me/ledger/deposits/intent')) {
      return Promise.resolve({ ok: true, json: async () => ({ intent: openIntent }) });
    }
    if (url.includes('/api/me/ledger')) {
      return Promise.resolve({ ok: true, json: async () => ledgerBody });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

async function goToBillsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('tab', { name: 'Bills' }));
}

function rowTexts() {
  // Only the active tab's table is mounted at a time, so there's exactly one table.
  const table = screen.getByRole('table');
  const rows = within(table).getAllByRole('row').slice(1); // skip header row
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

  it('shows Payment History and Bills tabs, defaulting to Payment History', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Payment History' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Payment History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('+₹4,000')).toBeInTheDocument();
    expect(screen.queryByText('Mar 2026')).not.toBeInTheDocument(); // Bills table is hidden
  });

  it('the Payment History tab shows DEPOSIT rows with a receipt button where hasReceipt is set', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('+₹4,000')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /^receipt$/i })).toBeInTheDocument();
  });

  it('shows an empty state on the Payment History tab when there are no deposits', async () => {
    mockFetch({ ...ledger, entries: ledger.entries.filter((e) => e.type !== 'DEPOSIT') });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no payments yet/i)).toBeInTheDocument());
  });

  it('switches to the Bills tab: shows only SYSTEM charges, not Deposit/Credit rows, each with its own settlement status', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);

    expect(screen.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Mar 2026')).toBeInTheDocument();
    expect(screen.getByText('Jan 2026')).toBeInTheDocument();
    expect(screen.getByText('Feb 2026')).toBeInTheDocument();
    expect(screen.queryByText('+₹4,000')).not.toBeInTheDocument(); // Payment History table is hidden

    expect(screen.getByText('Paid')).toBeInTheDocument(); // Jan, fully settled
    expect(screen.getByText('Unpaid')).toBeInTheDocument(); // Mar, untouched
    expect(screen.getByText('Partially settled')).toBeInTheDocument(); // Feb
    expect(screen.getByText('₹900 of ₹3,000')).toBeInTheDocument(); // Feb's settled-so-far
  });

  it('sorts by date descending by default, newest first', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    expect(rowTexts().map((r) => r[0])).toEqual(['Mar 2026', 'Feb 2026', 'Jan 2026']);
  });

  it('toggles date sort order on header click', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^date/i }));

    await waitFor(() => expect(rowTexts().map((r) => r[0])).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026']));
  });

  it('sorts by amount when the Amount header is clicked', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
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

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    await user.type(screen.getByLabelText('From'), '2026-02-01');

    await waitFor(() => {
      expect(screen.queryByText('Jan 2026')).not.toBeInTheDocument();
      expect(screen.getByText('Feb 2026')).toBeInTheDocument();
      expect(screen.getByText('Mar 2026')).toBeInTheDocument();
    });
  });

  it('shows an empty state on the Bills tab when there are no SYSTEM records', async () => {
    mockFetch({ entries: [], totals: { totalCharges: 0, outstanding: 0 } });
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText(/no maintenance records yet/i)).toBeInTheDocument());
  });

  it('shows "Total maintenance amount" and "Maintenance Outstanding" cards from the lifetime totals, regardless of active tab', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/total maintenance amount/i)).toBeInTheDocument());
    expect(screen.getByText('₹6,500')).toBeInTheDocument();
    expect(screen.getByText(/^maintenance outstanding$/i)).toBeInTheDocument();
    expect(screen.getAllByText('₹1,100').length).toBeGreaterThan(0);
  });

  it('has no year selector', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Mar 2026')).toBeInTheDocument());
    expect(screen.queryByLabelText('Year')).not.toBeInTheDocument();
  });

  it('shows the Pay control on the Bills tab: pre-fills Outstanding, locks the amount, and requires a screenshot before submitting', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    const amountInput = await screen.findByLabelText('Amount to pay');
    await waitFor(() => expect(amountInput).toHaveValue(1100));

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/me\/ledger\/deposits\/intent$/),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 1100, category: 'MAINTENANCE' }) }),
      );
    });

    const submitButton = await screen.findByRole('button', { name: /submit payment/i });
    expect(submitButton).toBeDisabled();

    const file = new File(['fake-bytes'], 'proof.png', { type: 'image/png' });
    await user.upload(screen.getByLabelText(/attach payment screenshot/i, { selector: 'input' }), file);
    expect(submitButton).toBeEnabled();
  });

  it('accepts a Pay amount above Outstanding and shows the Available Credit hint (2026-08-20 pivot — no longer capped)', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    const amountInput = await screen.findByLabelText('Amount to pay');
    await waitFor(() => expect(amountInput).toHaveValue(1100));

    await user.clear(amountInput);
    await user.type(amountInput, '1600');

    await waitFor(() =>
      expect(screen.getByText(/₹500 will be applied as Available Credit/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /^pay$/i })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/me\/ledger\/deposits\/intent$/),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 1600, category: 'MAINTENANCE' }) }),
      );
    });
  });

  it('shows a notice instead of the Pay button on the Bills tab when the open intent is for Other Charges', async () => {
    mockFetch(ledger, {
      id: 'intent-2',
      amount: 300,
      paymentMethod: 'UPI',
      upiLink: 'upi://pay?y',
      qrDataUrl: 'data:image/png;base64,def',
      category: 'OTHER_CHARGE',
    });
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText(/pending payment for other charges/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
  });

  it('hides the Pay controls and shows "Nothing outstanding right now" on the Bills tab when outstanding is 0', async () => {
    mockFetch({ ...ledger, totals: { ...ledger.totals, outstanding: 0 } });
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText(/nothing outstanding right now/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
  });
});
