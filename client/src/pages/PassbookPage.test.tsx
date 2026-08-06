import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { PassbookPage } from './PassbookPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <PassbookPage />
    </QueryClientProvider>,
  );
}

// Deliberately distinct from every row's own amount below, so exact-text queries on
// the summary cards can't collide with a per-row figure that happens to share the
// same number.
const baseLedger = {
  totals: { totalCharges: 6600, approvedDeposits: 4400, approvedCredits: 550, outstanding: 2200, creditBalance: 550, payable: 1650 },
  entries: [
    { id: 'sys-1', type: 'SYSTEM', period: '2026-01', date: '2026-01-01T00:00:00.000Z', payer: 'Owner', amount: 2000, status: 'APPROVED' },
    { id: 'dep-1', type: 'DEPOSIT', date: '2026-06-18T00:00:00.000Z', payer: 'You', amount: 4000, status: 'APPROVED', note: 'UPI payment - covers Jan-Jun' },
    { id: 'dep-2', type: 'DEPOSIT', date: '2026-08-02T00:00:00.000Z', payer: 'You', amount: 400, status: 'PENDING', note: 'UPI payment - awaiting review' },
    { id: 'cred-1', type: 'CREDIT', date: '2026-07-10T00:00:00.000Z', payer: 'You', amount: 500, status: 'APPROVED', note: 'Paid lift technician call-out fee' },
  ],
};

function mockFetch(ledger: unknown = baseLedger) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/me/ledger/deposits/qr')) {
      return Promise.resolve({ ok: true, json: async () => ({ amount: 1500, upiLink: 'upi://pay?x', qrDataUrl: 'data:image/png;base64,abc' }) });
    }
    if (url.includes('/api/me/ledger/deposits')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: 'dep-new', status: 'PENDING' }) });
    }
    if (url.includes('/api/me/ledger/credits')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: 'cred-new', status: 'PENDING' }) });
    }
    if (url.includes('/api/me/ledger')) {
      return Promise.resolve({ ok: true, json: async () => ledger });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('PassbookPage', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows the three summary cards', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹2,200')).toBeInTheDocument()); // Outstanding
    expect(screen.getByText('₹550')).toBeInTheDocument(); // Credit balance
    // Payable also appears in the "You owe ..." line below the cards.
    expect(screen.getAllByText('₹1,650').length).toBeGreaterThan(0);
  });

  it('shows the ledger table with SYSTEM/DEPOSIT/CREDIT rows and their statuses', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('System')).toBeInTheDocument());
    expect(screen.getAllByText('Deposit').length).toBe(2);
    expect(screen.getByText('Credit')).toBeInTheDocument();
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows the Pay button when payable > 0, and submits a deposit', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('button', { name: /^pay$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: /submit payment/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /submit payment/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/me/ledger/deposits'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('hides the Pay button and shows "Nothing payable right now" when payable is 0', async () => {
    mockFetch({ ...baseLedger, totals: { ...baseLedger.totals, payable: 0 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/nothing payable right now/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
  });

  it('opens the Add credit modal and submits a credit', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('button', { name: /add credit/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add credit/i }));

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText(/e\.g\. 1500/i), '250');
    await user.type(screen.getByPlaceholderText(/paid plumber/i), 'Paid electrician');
    await user.click(screen.getByRole('button', { name: /submit for approval/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/me/ledger/credits'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows an error state when the ledger request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
