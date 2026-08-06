import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { MaintenancePage } from './MaintenancePage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  // retry: false — React Query's default 3 retries with backoff would outlast
  // waitFor's default 1s timeout on the error-state test below.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MaintenancePage />
    </QueryClientProvider>,
  );
}

const records = [
  {
    id: 'r1',
    period: '2026-07',
    payerType: 'OWNER' as const,
    amount: '2000',
    status: 'UNPAID' as const,
    dueDate: '2026-07-16',
    flat: { id: 'f1', block: 'A', flatNumber: '101' },
  },
  {
    id: 'r2',
    period: '2026-06',
    payerType: 'OWNER' as const,
    amount: '1800',
    status: 'PAID' as const,
    dueDate: '2026-06-16',
    flat: { id: 'f1', block: 'A', flatNumber: '101' },
  },
];

describe('MaintenancePage', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows the outstanding total and each record with its status', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => records });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('outstanding-total')).toHaveTextContent('₹2,000'));
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText(/all settled/i)).not.toBeInTheDocument();
  });

  it('shows "All settled" when nothing is unpaid', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [records[1]] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/all settled/i)).toBeInTheDocument());
  });

  it('shows an empty state with no records', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no maintenance records yet/i)).toBeInTheDocument());
  });

  it('shows an error message on fetch failure', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
