import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { AdminDashboardPage } from './AdminDashboardPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage(onNavigateToProofs?: () => void) {
  // retry: false — React Query's default retries would otherwise outlast waitFor's
  // default timeout on the error-state test below.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminDashboardPage onNavigateToProofs={onNavigateToProofs} />
    </QueryClientProvider>,
  );
}

// Deliberately distinct from flatDues/flaggedFlats' amounts below, so assertions can
// use exact-text queries without colliding with a per-flat figure that happens to
// share the same number.
const summary = { totalBilled: 4700, totalPaid: 2000, outstandingTotal: 2700, pendingReviewTotal: 2000, collectionRatePercent: 23 };

const flatDues = [
  {
    flat: { id: 'flat-1', wing: 'A', flatNumber: '101' },
    owner: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com', phone: null },
    currentTenant: null,
    outstandingTotal: 1500,
    unpaidCount: 2,
  },
  {
    flat: { id: 'flat-2', wing: 'A', flatNumber: '102' },
    owner: { id: 'owner-2', name: 'Bob Owner', email: 'bob@example.com', phone: null },
    currentTenant: null,
    outstandingTotal: 0,
    unpaidCount: 0,
  },
];

const flaggedFlats = [
  {
    flat: { id: 'flat-1', wing: 'A', flatNumber: '101' },
    recipient: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com' },
    outstandingTotal: 1500,
    oldestDueDate: '2026-06-01T00:00:00.000Z',
    overdueRecordCount: 1,
    message: 'Dear Alice Owner, this is a reminder... A-101 ... 1,500 ...',
  },
];

function mockFetch(overrides: Partial<{ pendingProofsCount: number }> = {}) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/dashboard/summary')) {
      return Promise.resolve({ ok: true, json: async () => summary });
    }
    if (url.includes('/api/admin/dashboard/flat-dues')) {
      return Promise.resolve({ ok: true, json: async () => flatDues });
    }
    if (url.includes('/api/admin/dashboard/flagged-flats')) {
      return Promise.resolve({ ok: true, json: async () => flaggedFlats });
    }
    if (url.includes('/api/admin/payment-proofs')) {
      const count = overrides.pendingProofsCount ?? 3;
      return Promise.resolve({ ok: true, json: async () => Array.from({ length: count }, (_, i) => ({ id: `p${i}` })) });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('AdminDashboardPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows the summary cards', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('₹2,700')).toBeInTheDocument());
    expect(screen.getByText('23%')).toBeInTheDocument();
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
  });

  it('shows the pending proofs widget with the correct count and navigates on click', async () => {
    mockFetch({ pendingProofsCount: 3 });
    const onNavigate = vi.fn();
    renderPage(onNavigate);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(/3 payment proofs pending review/i)).toBeInTheDocument());
    await user.click(screen.getByText(/3 payment proofs pending review/i));
    expect(onNavigate).toHaveBeenCalled();
  });

  it('uses singular phrasing for exactly one pending proof', async () => {
    mockFetch({ pendingProofsCount: 1 });
    renderPage();

    await waitFor(() => expect(screen.getByText(/1 payment proof pending review/i)).toBeInTheDocument());
  });

  it('shows the flagged flats table with a working copy-message button', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Flagged flats')).toBeInTheDocument());
    expect(screen.getAllByText('A-101').length).toBeGreaterThan(0);

    // userEvent.setup() installs its own navigator.clipboard stub (overwriting any
    // pre-existing mock), so we can only spy on writeText *after* setup runs.
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: /copy message/i }));
    expect(writeTextSpy).toHaveBeenCalledWith(flaggedFlats[0].message);
    await waitFor(() => expect(screen.getByRole('button', { name: /^copied$/i })).toBeInTheDocument());
  });

  it('shows the flat-wise dues table, including settled flats', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Flat-wise dues')).toBeInTheDocument());
    expect(screen.getByText('A-102')).toBeInTheDocument(); // the ₹0 flat is still listed
  });

  it('shows an error state when a request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
