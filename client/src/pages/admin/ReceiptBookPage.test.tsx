import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { ReceiptBookPage } from './ReceiptBookPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceiptBookPage />
    </QueryClientProvider>,
  );
}

// One MAINTENANCE receipt (a Deposit) and one OTHER_CHARGE receipt (a Deposit
// against the Other Charges pool) — the Category column must distinguish them
// (docs/other-charges/): Receipt Book covers both pools, its backend query
// (listReceipts) has no category filter.
const receipts = [
  {
    id: 'r-1',
    receiptNumber: 'RCPT-A101-abc123',
    issuedAt: '2026-06-20T00:00:00.000Z',
    ledgerEntry: {
      id: 'le-1',
      category: 'MAINTENANCE',
      amount: '2000',
      note: null,
      payer: { id: 'p1', name: 'Alice Owner', email: 'alice@example.com' },
      flat: { id: 'f1', wing: 'A', flatNumber: '101' },
    },
  },
  {
    id: 'r-2',
    receiptNumber: 'RCPT-B202-def456',
    issuedAt: '2026-07-05T00:00:00.000Z',
    ledgerEntry: {
      id: 'le-2',
      category: 'OTHER_CHARGE',
      amount: '500',
      note: null,
      payer: { id: 'p2', name: 'Bob Tenant', email: 'bob@example.com' },
      flat: { id: 'f2', wing: 'B', flatNumber: '202' },
    },
  },
];

function mockFetch(body: unknown = receipts) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/receipts')) {
      return Promise.resolve({ ok: true, json: async () => body });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('ReceiptBookPage', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('lists every receipt with a Category badge distinguishing Maintenance from Other Charge', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('RCPT-A101-abc123')).toBeInTheDocument());
    expect(screen.getByText('RCPT-B202-def456')).toBeInTheDocument();

    expect(screen.getByText('Maintenance')).toBeInTheDocument();
    expect(screen.getByText('Other Charge')).toBeInTheDocument();
  });

  it('filters by date range', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('RCPT-A101-abc123')).toBeInTheDocument());
    await user.type(screen.getByLabelText('From'), '2026-07-01');

    await waitFor(() => {
      expect(screen.queryByText('RCPT-A101-abc123')).not.toBeInTheDocument();
      expect(screen.getByText('RCPT-B202-def456')).toBeInTheDocument();
    });
  });

  it('searches by resident name', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('RCPT-A101-abc123')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Search'), 'Bob');

    await waitFor(() => {
      expect(screen.queryByText('RCPT-A101-abc123')).not.toBeInTheDocument();
      expect(screen.getByText('RCPT-B202-def456')).toBeInTheDocument();
    });
  });

  it('shows an empty state when nothing has been issued yet', async () => {
    mockFetch([]);
    renderPage();

    await waitFor(() => expect(screen.getByText(/no receipts found/i)).toBeInTheDocument());
  });
});
