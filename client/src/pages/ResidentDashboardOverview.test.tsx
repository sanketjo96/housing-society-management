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
// Total Paid row is reading the year-scoped figure or the lifetime one. outstanding
// stays 2200 (unchanged from before Credit's return) so the existing Pay-amount
// tests below don't need to change; availableCredit is asserted separately, with its
// own fixture override, in the Available Credit card test.
const baseLedger = {
  totals: { totalCharges: 6600, approvedDeposits: 4400, approvedCredits: 0, outstanding: 2200, availableCredit: 0 },
  yearTotals: { totalCharges: 3000, approvedDeposits: 3000, approvedCredits: 0, outstanding: 0, availableCredit: 0 },
  entries: [
    { id: 'sys-1', type: 'SYSTEM', period: `${currentYear}-01`, date: `${currentYear}-01-01T00:00:00.000Z`, payer: 'Owner', amount: 2000, status: 'APPROVED' },
    { id: 'dep-1', type: 'DEPOSIT', date: `${currentYear}-06-18T00:00:00.000Z`, payer: 'You', amount: 4000, status: 'APPROVED', note: 'UPI payment - covers Jan-Jun' },
    { id: 'dep-2', type: 'DEPOSIT', date: `${currentYear}-08-02T00:00:00.000Z`, payer: 'You', amount: 400, status: 'PENDING', note: 'UPI payment - awaiting review' },
    { id: 'cred-1', type: 'CREDIT', date: `${currentYear}-07-10T00:00:00.000Z`, payer: 'You', amount: 300, status: 'APPROVED', note: 'Plumber repair for common water tank' },
  ],
  availableYears: [currentYear],
};

function mockFetch(ledger: unknown = baseLedger, openIntent: unknown = null, receiptEntryId?: string) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (receiptEntryId && url.includes(`/api/ledger-entries/${receiptEntryId}/receipt`)) {
      return Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-fake']) });
    }
    if (url.includes('/api/me/ledger/credits')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: 'cred-new', status: 'PENDING' }) });
    }
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

  it('shows an Outstanding card reflecting the lifetime total (not year-scoped)', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^outstanding$/i)).toBeInTheDocument());
    // Appears in both the card and the "You owe ..." line below it.
    expect(screen.getAllByText('₹2,200').length).toBeGreaterThan(0);
    // No Payable/Amount Paid cards exist anymore (those were removed in the
    // 2026-08-07 Credit-removal pivot and never came back).
    expect(screen.queryByText(/^payable$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/amount paid/i)).not.toBeInTheDocument();
  });

  it('always shows an Available Credit card, even when it is ₹0 (per the 2026-08-07 Credit re-introduction — always-visible, not conditional)', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^available credit$/i)).toBeInTheDocument());
    expect(screen.getAllByText('₹0').length).toBeGreaterThan(0);
  });

  it('shows a nonzero Available Credit figure when the flat has one', async () => {
    mockFetch({ ...baseLedger, totals: { ...baseLedger.totals, outstanding: 0, availableCredit: 550 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/^available credit$/i)).toBeInTheDocument());
    expect(screen.getByText('₹550')).toBeInTheDocument();
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

  it('shows the ledger table with Deposit and Credit rows (no SYSTEM charges), with a Type column now that there is something to distinguish again', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('+₹4,000')).toBeInTheDocument());
    expect(screen.queryByText('System')).not.toBeInTheDocument();
    expect(screen.getAllByText('Deposit').length).toBe(2);
    expect(screen.getByText('Credit')).toBeInTheDocument();
    expect(screen.getByText('Plumber repair for common water tank')).toBeInTheDocument();
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows a year selector populated from availableYears', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Year')).toBeInTheDocument());
    expect(screen.getByRole('option', { name: String(currentYear) })).toBeInTheDocument();
  });

  it('pre-fills the amount field with the full Outstanding; tapping Pay locks it, then requires a screenshot before submitting', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    const amountInput = await screen.findByLabelText('Amount to pay');
    await waitFor(() => expect(amountInput).toHaveValue(2200));

    const payButton = screen.getByRole('button', { name: /^pay$/i });
    await user.click(payButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/me\/ledger\/deposits\/intent$/),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 2200 }) }),
      );
    });

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

  it('allows editing the amount down to a smaller partial payment and locks exactly that amount', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    const amountInput = await screen.findByLabelText('Amount to pay');
    await waitFor(() => expect(amountInput).toHaveValue(2200));

    await user.clear(amountInput);
    await user.type(amountInput, '500');

    const payButton = screen.getByRole('button', { name: /^pay$/i });
    await user.click(payButton);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/me\/ledger\/deposits\/intent$/),
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ amount: 500 }) }),
      );
    });
  });

  it('disables Pay and shows an error when the entered amount exceeds Outstanding', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    const amountInput = await screen.findByLabelText('Amount to pay');
    await waitFor(() => expect(amountInput).toHaveValue(2200));

    await user.clear(amountInput);
    await user.type(amountInput, '5000');

    const payButton = screen.getByRole('button', { name: /^pay$/i });
    expect(payButton).toBeDisabled();
    expect(screen.getByText(/enter an amount between ₹1 and ₹2,200/i)).toBeInTheDocument();
  });

  it('disables Pay when the entered amount is 0 or the field is cleared', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    const amountInput = await screen.findByLabelText('Amount to pay');
    await waitFor(() => expect(amountInput).toHaveValue(2200));

    await user.clear(amountInput);
    const payButton = screen.getByRole('button', { name: /^pay$/i });
    expect(payButton).toBeDisabled();

    await user.type(amountInput, '0');
    expect(payButton).toBeDisabled();
  });

  it('shows the resume-payment panel automatically when an intent is already open', async () => {
    mockFetch(baseLedger, { id: 'intent-1', amount: 500, upiLink: 'upi://pay?x', qrDataUrl: 'data:image/png;base64,abc' });
    renderPage();

    await waitFor(() => expect(screen.getByText(/locked/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount to pay')).not.toBeInTheDocument();
  });

  it('hides the Pay controls and shows "Nothing outstanding right now" when outstanding is 0', async () => {
    mockFetch({ ...baseLedger, totals: { ...baseLedger.totals, outstanding: 0 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/nothing outstanding right now/i)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Amount to pay')).not.toBeInTheDocument();
  });

  it('shows an error state when the ledger request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  describe('Add credit modal', () => {
    async function fillAmountAndReason(user: ReturnType<typeof userEvent.setup>) {
      await user.type(screen.getByLabelText('Amount'), '550');
      await user.type(screen.getByLabelText('Reason'), 'Plumber repair for the common water tank');
    }

    it('opens on "Add credit", requires an amount, a reason, AND a proof file, and submits multipart to POST /api/me/ledger/credits', async () => {
      mockFetch();
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /add credit/i }));
      expect(await screen.findByRole('dialog', { name: /add credit/i })).toBeInTheDocument();

      const submitButton = screen.getByRole('button', { name: /submit for approval/i });
      expect(submitButton).toBeDisabled();

      await user.type(screen.getByLabelText('Amount'), '550');
      expect(submitButton).toBeDisabled(); // amount alone isn't enough — a reason is required too

      await user.type(screen.getByLabelText('Reason'), 'Plumber repair for the common water tank');
      expect(submitButton).toBeDisabled(); // still not enough — proof is mandatory too

      const file = new File(['fake-bytes'], 'receipt.jpg', { type: 'image/jpeg' });
      const fileInput = screen.getByLabelText(/attach receipt, invoice, or photo/i, { selector: 'input' });
      await user.upload(fileInput, file);
      expect(submitButton).toBeEnabled();

      await user.click(submitButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/me/ledger/credits'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
      const call = (fetch as unknown as FetchMock).mock.calls.find((args: unknown[]) =>
        (args[0] as string).includes('/api/me/ledger/credits'),
      )!;
      const init = call[1] as RequestInit;
      const body = init.body as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('amount')).toBe('550');
      expect(body.get('note')).toBe('Plumber repair for the common water tank');
      expect(body.get('file')).toBeInstanceOf(File);
      expect((body.get('file') as File).name).toBe('receipt.jpg');

      // Closes on success.
      await waitFor(() => expect(screen.queryByRole('dialog', { name: /add credit/i })).not.toBeInTheDocument());
    });

    it('is not capped by Outstanding — unlike the Pay amount field, a credit amount larger than Outstanding is accepted client-side', async () => {
      mockFetch();
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /add credit/i }));
      await user.type(screen.getByLabelText('Amount'), '999999');
      await user.type(screen.getByLabelText('Reason'), 'Large reimbursement, well above Outstanding');
      const file = new File(['fake-bytes'], 'receipt.jpg', { type: 'image/jpeg' });
      await user.upload(screen.getByLabelText(/attach receipt, invoice, or photo/i, { selector: 'input' }), file);

      expect(screen.getByRole('button', { name: /submit for approval/i })).toBeEnabled();
    });

    it('shows a server error and keeps the modal open when submission fails', async () => {
      const fetchMock = fetch as unknown as FetchMock;
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/me/ledger/credits')) {
          return Promise.resolve({ ok: false, json: async () => ({ error: 'Something went wrong' }) });
        }
        if (url.includes('/api/me/ledger/deposits/intent')) {
          return Promise.resolve({ ok: true, json: async () => ({ intent: null }) });
        }
        if (url.includes('/api/me/ledger')) {
          return Promise.resolve({ ok: true, json: async () => baseLedger });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /add credit/i }));
      await fillAmountAndReason(user);
      const file = new File(['fake-bytes'], 'receipt.jpg', { type: 'image/jpeg' });
      await user.upload(screen.getByLabelText(/attach receipt, invoice, or photo/i, { selector: 'input' }), file);
      await user.click(screen.getByRole('button', { name: /submit for approval/i }));

      await waitFor(() => expect(screen.getByText('Something went wrong')).toBeInTheDocument());
      expect(screen.getByRole('dialog', { name: /add credit/i })).toBeInTheDocument();
    });

    it('closes without submitting when the close button is clicked', async () => {
      mockFetch();
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /add credit/i }));
      await user.click(screen.getByRole('button', { name: /close/i }));

      expect(screen.queryByRole('dialog', { name: /add credit/i })).not.toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/me/ledger/credits'), expect.anything());
    });
  });

  describe('receipt download', () => {
    beforeEach(() => {
      vi.stubGlobal('open', vi.fn());
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
      globalThis.URL.revokeObjectURL = vi.fn();
    });

    it('shows a Receipt button only for an approved row with hasReceipt, and downloads it via authenticated fetch', async () => {
      const ledgerWithReceipt = {
        ...baseLedger,
        entries: baseLedger.entries.map((e) => (e.id === 'dep-1' ? { ...e, hasReceipt: true } : e)),
      };
      mockFetch(ledgerWithReceipt, null, 'dep-1');

      renderPage();
      const user = userEvent.setup();

      // dep-1 (has a receipt) shows the button; cred-1 (approved but no receipt) doesn't.
      const receiptButtons = await screen.findAllByRole('button', { name: /^receipt$/i });
      expect(receiptButtons).toHaveLength(1);

      await user.click(receiptButtons[0]);

      await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:fake-url', '_blank'));
    });

    it('shows no Receipt button when nothing has hasReceipt set', async () => {
      mockFetch();
      renderPage();

      await waitFor(() => expect(screen.getByText('Plumber repair for common water tank')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /^receipt$/i })).not.toBeInTheDocument();
    });
  });
});
