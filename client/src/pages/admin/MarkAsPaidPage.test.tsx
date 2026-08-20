import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { MarkAsPaidPage } from './MarkAsPaidPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MarkAsPaidPage />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

const adminEntry = {
  id: 'entry-1',
  amount: '2000',
  category: 'MAINTENANCE' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  payer: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com' },
  flat: { id: 'f1', wing: 'A', flatNumber: '101' },
};

const flatOptions = [
  { id: 'f1', wing: 'A', flatNumber: '101', owner: { name: 'Alice Owner' } },
  { id: 'f2', wing: 'B', flatNumber: '201', owner: { name: 'Bob Owner' } },
];

describe('MarkAsPaidPage', () => {
  beforeEach(() => {
    setAccessToken('token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('fetches entries filtered to createdByType=ADMIN and renders them', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let requestedUrl = '';
    fetchMock.mockImplementation((url: string) => {
      requestedUrl = url;
      return Promise.resolve({ ok: true, json: async () => [adminEntry] });
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('Alice Owner')).toBeInTheDocument());
    expect(requestedUrl).toContain('createdByType=ADMIN');
    expect(screen.getByText('A-101')).toBeInTheDocument();
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
  });

  it('shows the empty state when nothing has been marked as paid yet', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('No payments have been marked as paid yet.')).toBeInTheDocument(),
    );
  });

  it('opens the form, submits, and refreshes every dependent query on success', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let manualDepositBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/manual-deposit')) {
        manualDepositBody = init?.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ id: 'entry-9', status: 'APPROVED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const { queryClient } = renderPage();
    // Simulates these pages' own queries already sitting in the cache (e.g. the
    // admin visited them earlier) — this is what would go stale/miss the update
    // if this mutation didn't invalidate them too.
    queryClient.setQueryData(['admin-receipts'], []);
    queryClient.setQueryData(['admin-dashboard-summary'], {});
    queryClient.setQueryData(['admin-other-charges'], []);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^mark as paid$/i }));
    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/flat/i), 'f1');
    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.click(screen.getByRole('button', { name: /marking as paid|^mark as paid$/i }));

    await waitFor(() => expect(manualDepositBody).toBeDefined());
    expect(JSON.parse(manualDepositBody!)).toEqual({ flatId: 'f1', amount: 500, category: 'MAINTENANCE' });

    // manualDeposit also issues a real Receipt — Receipt Book's cached list must
    // be invalidated too, or a 30s-fresh cache would silently miss it.
    await waitFor(() => expect(queryClient.getQueryState(['admin-receipts'])?.isInvalidated).toBe(true));
    // Affects one of the two pools (docs/other-charges/) — the admin dashboard's
    // cards and (if applicable) the Other Charges list must refresh too.
    expect(queryClient.getQueryState(['admin-dashboard-summary'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['admin-other-charges'])?.isInvalidated).toBe(true);
    // The form closes back into the list on success.
    expect(screen.queryByLabelText(/flat/i)).not.toBeInTheDocument();
  });

  it('selecting Other Charge sends category=OTHER_CHARGE', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let manualDepositBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/manual-deposit')) {
        manualDepositBody = init?.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ id: 'entry-10', status: 'APPROVED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^mark as paid$/i }));
    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/flat/i), 'f1');
    await user.type(screen.getByLabelText(/amount/i), '750');
    await user.selectOptions(screen.getByLabelText(/category/i), 'OTHER_CHARGE');
    await user.click(screen.getByRole('button', { name: /marking as paid|^mark as paid$/i }));

    await waitFor(() => expect(manualDepositBody).toBeDefined());
    expect(JSON.parse(manualDepositBody!)).toEqual({ flatId: 'f1', amount: 750, category: 'OTHER_CHARGE' });
  });

  it('shows the server error and keeps the form open on an invalid amount', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/manual-deposit')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Amount must be greater than 0' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^mark as paid$/i }));
    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/flat/i), 'f1');
    await user.type(screen.getByLabelText(/amount/i), '10');
    await user.click(screen.getByRole('button', { name: /marking as paid|^mark as paid$/i }));

    expect(await screen.findByText('Amount must be greater than 0')).toBeInTheDocument();
    // Still open — the form doesn't get dismissed on a failed submit.
    expect(screen.getByLabelText(/flat/i)).toBeInTheDocument();
  });
});
