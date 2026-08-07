import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { ResidentDashboardOverview } from './ResidentDashboardOverview';

type FetchMock = ReturnType<typeof vi.fn>;

const currentYear = new Date().getFullYear();

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResidentDashboardOverview />
    </QueryClientProvider>,
  );
}

// yearTotals deliberately distinct from totals, so a test can tell whether the
// Total Paid row is reading the year-scoped figure or the lifetime one.
const baseLedger = {
  totals: { totalCharges: 6600, approvedDeposits: 4400, outstanding: 2200 },
  yearTotals: { totalCharges: 3000, approvedDeposits: 3000, outstanding: 0 },
  entries: [
    { id: 'sys-1', type: 'SYSTEM', period: `${currentYear}-01`, date: `${currentYear}-01-01T00:00:00.000Z`, payer: 'Owner', amount: 2000, status: 'APPROVED' },
    { id: 'dep-1', type: 'DEPOSIT', date: `${currentYear}-06-18T00:00:00.000Z`, payer: 'You', amount: 4000, status: 'APPROVED', note: 'UPI payment - covers Jan-Jun' },
    { id: 'dep-2', type: 'DEPOSIT', date: `${currentYear}-08-02T00:00:00.000Z`, payer: 'You', amount: 400, status: 'PENDING', note: 'UPI payment - awaiting review' },
  ],
  availableYears: [currentYear],
};

function mockFetch(ledger: unknown = baseLedger, openIntent: unknown = null) {
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
        json: async () => ({ intent: { id: 'intent-1', amount: 500, upiLink: 'upi://pay?x', qrDataUrl: 'data:image/png;base64,abc' } }),
      });
    }
    if (url.includes('/api/me/ledger/deposits/intent')) {
      return Promise.resolve({ ok: true, json: async () => ({ intent: openIntent }) });
    }
    if (url.includes('/api/me/ledger')) {
      return Promise.resolve({ ok: true, json: async () => ledger });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('ResidentDashboardOverview', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows a single Outstanding card reflecting the lifetime total (not year-scoped)', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^outstanding$/i)).toBeInTheDocument());
    // Appears in both the card and the "You owe ..." line below it.
    expect(screen.getAllByText('₹2,200').length).toBeGreaterThan(0);
    // No Credit/Payable/Amount Paid cards exist anymore.
    expect(screen.queryByText(/^credit$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^payable$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/amount paid/i)).not.toBeInTheDocument();
  });

  it('shows a "Total Paid (year)" row below the table, from yearTotals — not the lifetime totals', async () => {
    mockFetch();
    renderPage();

    // yearTotals.approvedDeposits (3000) is deliberately different from
    // totals.approvedDeposits (4400) in the fixture — this only passes if the row
    // reads the year-scoped figure.
    await waitFor(() => expect(screen.getByText(new RegExp(`total paid.*${currentYear}`, 'i'))).toBeInTheDocument());
    expect(screen.getByText('₹3,000')).toBeInTheDocument();
    expect(screen.queryByText('₹4,400')).not.toBeInTheDocument();
  });

  it('shows the ledger table with only Deposit rows (no SYSTEM charges, no Type column)', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('+₹4,000')).toBeInTheDocument());
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    expect(screen.queryByText('Deposit')).not.toBeInTheDocument(); // no Type column anymore
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows a year selector populated from availableYears', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Year')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: String(currentYear) })).toBeInTheDocument();
  });

  it('tapping Pay locks the amount immediately (no editable amount field), then requires a screenshot before submitting', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    const payButton = await screen.findByRole('button', { name: /^pay ₹2,200$/i });
    await user.click(payButton);

    // No amount input anywhere in this flow.
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();

    const submitButton = await screen.findByRole('button', { name: /submit payment/i });
    expect(submitButton).toBeDisabled();

    const file = new File(['fake-bytes'], 'proof.png', { type: 'image/png' });
    const fileInput = screen.getByLabelText(/attach payment screenshot/i, { selector: 'input' });
    await user.upload(fileInput, file);

    expect(submitButton).toBeEnabled();
    await user.click(submitButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/me/ledger/deposits/intent/submit'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows the resume-payment panel automatically when an intent is already open', async () => {
    mockFetch(baseLedger, { id: 'intent-1', amount: 500, upiLink: 'upi://pay?x', qrDataUrl: 'data:image/png;base64,abc' });
    renderPage();

    await waitFor(() => expect(screen.getByText(/locked/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^pay ₹/i })).not.toBeInTheDocument();
  });

  it('hides the Pay button and shows "Nothing outstanding right now" when outstanding is 0', async () => {
    mockFetch({ ...baseLedger, totals: { ...baseLedger.totals, outstanding: 0 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/nothing outstanding right now/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^pay ₹/i })).not.toBeInTheDocument();
  });

  it('shows an error state when the ledger request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
