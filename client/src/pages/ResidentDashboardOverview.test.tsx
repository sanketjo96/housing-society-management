import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { ResidentDashboardOverview } from './ResidentDashboardOverview';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ResidentDashboardOverview />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const baseBalances = {
  maintenance: { outstanding: 2200, availableCredit: 0 },
  otherCharges: { outstanding: 800 },
  totalOutstanding: 3000,
};

function mockFetch(balances: unknown = baseBalances) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/me/balances')) {
      return Promise.resolve({ ok: true, json: async () => balances });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

// The resident Dashboard restructure reduced this page to exactly 4 summary cards,
// each reading GET /api/me/balances — no Pay control, no ledger table here anymore
// (all moved to each pool's own book page). See MaintenanceBookPage.test.tsx /
// OtherChargesBookPage.test.tsx for coverage of that relocated behavior.
describe('ResidentDashboardOverview', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows exactly the 4 balance cards, each with the right figure', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^total outstanding$/i)).toBeInTheDocument());
    expect(screen.getByText('₹3,000')).toBeInTheDocument();

    expect(screen.getByText(/^maintenance outstanding$/i)).toBeInTheDocument();
    expect(screen.getByText('₹2,200')).toBeInTheDocument();

    expect(screen.getByText(/^other outstanding$/i)).toBeInTheDocument();
    expect(screen.getByText('₹800')).toBeInTheDocument();

    expect(screen.getByText(/^available maintenance credit$/i)).toBeInTheDocument();
    expect(screen.getByText('₹0')).toBeInTheDocument();
  });

  it('links Maintenance Outstanding and Available Maintenance Credit to /maintenance-book, Other Outstanding to /other-charges-book, with Total Outstanding not a link', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^maintenance outstanding$/i)).toBeInTheDocument());

    const maintenanceLink = screen.getByText(/^maintenance outstanding$/i).closest('a');
    expect(maintenanceLink).toHaveAttribute('href', '/maintenance-book');

    const otherLink = screen.getByText(/^other outstanding$/i).closest('a');
    expect(otherLink).toHaveAttribute('href', '/other-charges-book');

    // Available Maintenance Credit points at /maintenance-book too (2026-08-20
    // pivot) — the standalone Credit Book was removed; overpaying a Deposit is now
    // the only way to produce Available Credit, so the Pay flow's own book page is
    // the natural drill-down target.
    const creditLink = screen.getByText(/^available maintenance credit$/i).closest('a');
    expect(creditLink).toHaveAttribute('href', '/maintenance-book');

    const totalCard = screen.getByText(/^total outstanding$/i);
    expect(totalCard.closest('a')).toBeNull();
  });

  it('shows a nonzero Available Maintenance Credit figure when the flat has one', async () => {
    mockFetch({ ...baseBalances, maintenance: { outstanding: 0, availableCredit: 550 } });
    renderPage();

    await waitFor(() => expect(screen.getByText(/^available maintenance credit$/i)).toBeInTheDocument());
    expect(screen.getByText('₹550')).toBeInTheDocument();
  });

  it('shows "Nothing outstanding right now" when totalOutstanding is 0', async () => {
    mockFetch({ maintenance: { outstanding: 0, availableCredit: 0 }, otherCharges: { outstanding: 0 }, totalOutstanding: 0 });
    renderPage();

    await waitFor(() => expect(screen.getByText(/nothing outstanding right now/i)).toBeInTheDocument());
  });

  it('does not show "Nothing outstanding right now" when totalOutstanding is nonzero', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^total outstanding$/i)).toBeInTheDocument());
    expect(screen.queryByText(/nothing outstanding right now/i)).not.toBeInTheDocument();
  });

  it('shows an error state when the balances request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
