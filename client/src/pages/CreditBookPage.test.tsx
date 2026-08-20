import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { CreditBookPage } from './CreditBookPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CreditBookPage />
    </QueryClientProvider>,
  );
}

const baseLedger = {
  entries: [
    { id: 'sys-1', type: 'SYSTEM', period: '2026-01', date: '2026-01-01T00:00:00.000Z', amount: 2000, status: 'APPROVED' },
    { id: 'dep-1', type: 'DEPOSIT', date: '2026-06-18T00:00:00.000Z', amount: 4000, status: 'APPROVED' },
    {
      id: 'cred-1',
      type: 'CREDIT',
      date: '2026-07-10T00:00:00.000Z',
      amount: 300,
      status: 'APPROVED',
      note: 'Plumber repair for common water tank',
      hasReceipt: true,
    },
    {
      id: 'cred-2',
      type: 'CREDIT',
      date: '2026-07-20T00:00:00.000Z',
      amount: 100,
      status: 'PENDING',
      note: 'Painting reimbursement',
    },
  ],
  totals: { availableCredit: 550 },
};

function mockFetch(ledger: unknown = baseLedger) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/me/ledger/credits')) {
      return Promise.resolve({ ok: true, json: async () => ({ id: 'cred-new', status: 'PENDING' }) });
    }
    if (url.includes('/api/me/ledger')) {
      return Promise.resolve({ ok: true, json: async () => ledger });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('CreditBookPage', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows the Available Maintenance Credit card and only CREDIT rows (no SYSTEM/DEPOSIT)', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^available maintenance credit$/i)).toBeInTheDocument());
    expect(screen.getByText('₹550')).toBeInTheDocument();

    expect(screen.getByText('+₹300')).toBeInTheDocument();
    expect(screen.getByText('+₹100')).toBeInTheDocument();
    expect(screen.queryByText('+₹4,000')).not.toBeInTheDocument(); // the DEPOSIT row
    expect(screen.getByText('Plumber repair for common water tank')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('shows an empty state when there are no credit requests', async () => {
    mockFetch({ entries: [], totals: { availableCredit: 0 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/no credit requests yet/i)).toBeInTheDocument());
  });

  describe('Add credit modal', () => {
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
      await user.upload(screen.getByLabelText(/attach receipt, invoice, or photo/i, { selector: 'input' }), file);
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

      await waitFor(() => expect(screen.queryByRole('dialog', { name: /add credit/i })).not.toBeInTheDocument());
    });

    it('is not capped by Available Maintenance Credit/Outstanding — a large credit amount is accepted client-side', async () => {
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
        if (url.includes('/api/me/ledger')) {
          return Promise.resolve({ ok: true, json: async () => baseLedger });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /add credit/i }));
      await user.type(screen.getByLabelText('Amount'), '550');
      await user.type(screen.getByLabelText('Reason'), 'Plumber repair for the common water tank');
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
      const fetchMock = fetch as unknown as FetchMock;
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/ledger-entries/cred-1/receipt')) {
          return Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-fake']) });
        }
        if (url.includes('/api/me/ledger')) {
          return Promise.resolve({ ok: true, json: async () => baseLedger });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });
      renderPage();
      const user = userEvent.setup();

      // cred-1 (approved, hasReceipt) shows the button; cred-2 (pending) doesn't.
      const receiptButtons = await screen.findAllByRole('button', { name: /^receipt$/i });
      expect(receiptButtons).toHaveLength(1);

      await user.click(receiptButtons[0]);

      await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:fake-url', '_blank'));
    });
  });
});
