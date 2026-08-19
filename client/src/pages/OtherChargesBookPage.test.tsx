import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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

const baseLedger = {
  entries: [
    {
      id: 'oc-1',
      type: 'OTHER_CHARGE',
      feeTypeName: 'Transfer Fee',
      date: '2026-08-17T00:00:00.000Z',
      amount: 5000,
      settledAmount: 0,
      settlementStatus: 'UNPAID',
    },
  ],
  totals: { outstanding: 5000 },
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
        json: async () => ({
          intent: {
            id: 'intent-1',
            amount: 5000,
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
      return Promise.resolve({ ok: true, json: async () => ledger });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
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

  it('requests category=OTHER_CHARGE and shows the Other Outstanding card and the charge row', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^other outstanding$/i)).toBeInTheDocument());
    expect(screen.getAllByText('₹5,000').length).toBeGreaterThan(0);
    expect(screen.getByText('Transfer Fee')).toBeInTheDocument();
    expect(screen.getByText('Unpaid')).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/me/ledger?category=OTHER_CHARGE'),
      expect.anything(),
    );
  });

  it('locking a payment sends category=OTHER_CHARGE and shows the resume panel', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    const amountInput = await screen.findByLabelText('Amount to pay');
    await waitFor(() => expect(amountInput).toHaveValue(5000));

    await user.click(screen.getByRole('button', { name: /^pay$/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/me\/ledger\/deposits\/intent$/),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ amount: 5000, category: 'OTHER_CHARGE' }),
        }),
      );
    });

    expect(await screen.findByText(/locked/i)).toBeInTheDocument();
  });

  it('shows a notice instead of the Pay button when the open intent is for Maintenance', async () => {
    mockFetch(baseLedger, {
      id: 'intent-2',
      amount: 300,
      paymentMethod: 'UPI',
      upiLink: 'upi://pay?y',
      qrDataUrl: 'data:image/png;base64,def',
      category: 'MAINTENANCE',
    });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/pending payment for maintenance/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: /^pay$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/locked/i)).not.toBeInTheDocument();
  });

  it('shows an empty state with nothing billed yet', async () => {
    mockFetch({ entries: [], totals: { outstanding: 0 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/nothing outstanding right now/i)).toBeInTheDocument());
    expect(screen.getAllByText(/no charges billed yet/i).length).toBeGreaterThan(0);
  });
});
