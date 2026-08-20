import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { OtherChargesBookPage } from './OtherChargesBookPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OtherChargesBookPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Mirrors MaintenanceBookPage.test.tsx's fixture shape exactly — same restructure,
// applied to the Other Charges pool. Amounts deliberately don't correlate with date
// order (sort-by-amount assertions can't accidentally pass by matching date order).
// totals.totalCharges (6500) excludes the DEPOSIT row (4000) — only OTHER_CHARGE
// charges count toward it.
const ledger = {
  entries: [
    {
      id: 'oc-1',
      type: 'OTHER_CHARGE',
      feeTypeName: 'Joining Fee',
      date: '2026-01-01T00:00:00.000Z',
      amount: 1500,
      settledAmount: 1500,
      settlementStatus: 'PAID',
    },
    {
      id: 'oc-2',
      type: 'OTHER_CHARGE',
      feeTypeName: 'Transfer Fee',
      date: '2026-03-01T00:00:00.000Z',
      amount: 2000,
      settledAmount: 0,
      settlementStatus: 'UNPAID',
    },
    {
      id: 'oc-3',
      type: 'OTHER_CHARGE',
      feeTypeName: 'Fine',
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
            category: 'OTHER_CHARGE',
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

describe('OtherChargesBookPage', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('requests category=OTHER_CHARGE', async () => {
    mockFetch();
    renderPage();

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/me/ledger?category=OTHER_CHARGE'), expect.anything()),
    );
  });

  it('shows Payment History and Bills tabs, defaulting to Payment History', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: 'Payment History' })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: 'Payment History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByText('+₹4,000')).toBeInTheDocument();
    expect(screen.queryByText('Transfer Fee')).not.toBeInTheDocument(); // Bills table is hidden
  });

  it('the Payment History tab shows only DEPOSIT rows, with a receipt button where hasReceipt is set', async () => {
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

  it('switches to the Bills tab: shows only OTHER_CHARGE rows, each with its own settlement status and fee type', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);

    expect(screen.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Joining Fee')).toBeInTheDocument();
    expect(screen.getByText('Transfer Fee')).toBeInTheDocument();
    expect(screen.getByText('Fine')).toBeInTheDocument();
    expect(screen.queryByText('+₹4,000')).not.toBeInTheDocument(); // Payment History table is hidden

    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('Partially settled')).toBeInTheDocument();
    expect(screen.getByText('₹900 of ₹3,000')).toBeInTheDocument();
  });

  it('sorts by date descending by default, newest first', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Transfer Fee')).toBeInTheDocument());
    expect(rowTexts().map((r) => r[0])).toEqual(['Transfer Fee', 'Fine', 'Joining Fee']);
  });

  it('toggles date sort order on header click', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Transfer Fee')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /billed on/i }));

    await waitFor(() => expect(rowTexts().map((r) => r[0])).toEqual(['Joining Fee', 'Fine', 'Transfer Fee']));
  });

  it('sorts by amount when the Amount header is clicked', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Transfer Fee')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^amount/i }));

    // Descending by amount (3000, 2000, 1500) = Fine, Transfer Fee, Joining Fee.
    await waitFor(() => expect(rowTexts().map((r) => r[0])).toEqual(['Fine', 'Transfer Fee', 'Joining Fee']));
  });

  it('filters by date range', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText('Transfer Fee')).toBeInTheDocument());
    await user.type(screen.getByLabelText('From'), '2026-02-01');

    await waitFor(() => {
      expect(screen.queryByText('Joining Fee')).not.toBeInTheDocument();
      expect(screen.getByText('Fine')).toBeInTheDocument();
      expect(screen.getByText('Transfer Fee')).toBeInTheDocument();
    });
  });

  it('shows an empty state on the Bills tab when there are no charges billed', async () => {
    mockFetch({ entries: [], totals: { totalCharges: 0, outstanding: 0 } });
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText(/no charges billed yet/i)).toBeInTheDocument());
  });

  it('shows "Total other charges amount" and "Other Outstanding" cards from the lifetime totals, regardless of active tab', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/total other charges amount/i)).toBeInTheDocument());
    expect(screen.getByText('₹6,500')).toBeInTheDocument();
    expect(screen.getByText(/^other outstanding$/i)).toBeInTheDocument();
    expect(screen.getAllByText('₹1,100').length).toBeGreaterThan(0);
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
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ amount: 1100, category: 'OTHER_CHARGE' }),
        }),
      );
    });

    expect(await screen.findByText(/locked/i)).toBeInTheDocument();
  });

  it('shows a notice instead of the Pay button on the Bills tab when the open intent is for Maintenance', async () => {
    mockFetch(ledger, {
      id: 'intent-2',
      amount: 300,
      paymentMethod: 'UPI',
      upiLink: 'upi://pay?y',
      qrDataUrl: 'data:image/png;base64,def',
      category: 'MAINTENANCE',
    });
    renderPage();
    const user = userEvent.setup();

    await goToBillsTab(user);
    await waitFor(() => expect(screen.getByText(/pending payment for maintenance/i)).toBeInTheDocument());
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
