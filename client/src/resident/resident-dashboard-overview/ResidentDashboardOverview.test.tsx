import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { setAccessToken } from '../../lib/auth-token';
import { ResidentDashboardOverview } from './ResidentDashboardOverview';

type FetchMock = ReturnType<typeof vi.fn>;

const ownerUser = {
  id: 'owner-1',
  name: 'Alice Owner',
  email: 'alice@example.com',
  phone: null,
  role: 'OWNER' as const,
  societyId: 's1',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <ResidentDashboardOverview />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const baseBalances = {
  maintenance: { outstanding: 2200, availableCredit: 0 },
  otherCharges: { outstanding: 800 },
  totalOutstanding: 3000,
  availableYears: [2026, 2025],
};

const balances2025 = {
  maintenance: { outstanding: 400, availableCredit: 0 },
  otherCharges: { outstanding: 100 },
  totalOutstanding: 500,
  availableYears: [2026, 2025],
};

// Mutates `balances.complaints` in place on an upvote/unvote call, mirroring
// ComplaintsPage.test.tsx's pattern, so invalidating ['my-balances', year]
// re-fetches an observably-updated list.
function mockFetch(balances: Record<string, unknown> = baseBalances, user: unknown = ownerUser) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/refresh')) {
      return Promise.resolve({ ok: true, json: async () => ({ accessToken: 'fake-token' }) });
    }
    if (url.includes('/api/auth/me')) {
      return Promise.resolve({ ok: true, json: async () => user });
    }
    const upvoteMatch = url.match(/\/api\/complaints\/([^/]+)\/upvote$/);
    if (upvoteMatch) {
      const list = (balances.complaints ?? []) as Array<{
        id: string;
        myUpvoted: boolean;
        upvoteCount: number;
      }>;
      const complaint = list.find((c) => c.id === upvoteMatch[1]);
      if (complaint) {
        const nowUpvoted = init?.method === 'POST';
        if (complaint.myUpvoted !== nowUpvoted) {
          complaint.myUpvoted = nowUpvoted;
          complaint.upvoteCount += nowUpvoted ? 1 : -1;
        }
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (url.includes('/api/me/balances')) {
      const body = url.includes('year=2025') ? balances2025 : balances;
      return Promise.resolve({ ok: true, json: async () => body });
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
    mockFetch({
      maintenance: { outstanding: 0, availableCredit: 0 },
      otherCharges: { outstanding: 0 },
      totalOutstanding: 0,
      availableYears: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/nothing outstanding right now/i)).toBeInTheDocument());
  });

  it('does not show "Nothing outstanding right now" when totalOutstanding is nonzero', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText(/^total outstanding$/i)).toBeInTheDocument());
    expect(screen.queryByText(/nothing outstanding right now/i)).not.toBeInTheDocument();
  });

  it('shows a Year dropdown defaulting to "All", listing availableYears', async () => {
    mockFetch();
    renderPage();

    const select = await screen.findByLabelText('Year');
    expect(select).toHaveValue('ALL');
    expect(within(select).getByRole('option', { name: 'All' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '2026' })).toBeInTheDocument();
    expect(within(select).getByRole('option', { name: '2025' })).toBeInTheDocument();
  });

  it('selecting a year re-fetches balances scoped to that year and updates the cards', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('₹3,000')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Year'), '2025');

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/me/balances?year=2025'),
        expect.anything(),
      );
    });
    await waitFor(() => expect(screen.getByText('₹500')).toBeInTheDocument());
    expect(screen.queryByText('₹3,000')).not.toBeInTheDocument();
  });

  it('switching back to "All" re-fetches lifetime balances with no year param', async () => {
    mockFetch();
    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('₹3,000')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText('Year'), '2025');
    await waitFor(() => expect(screen.getByText('₹500')).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText('Year'), 'All');
    await waitFor(() => expect(screen.getByText('₹3,000')).toBeInTheDocument());

    const balancesCalls = (fetch as unknown as FetchMock).mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((url: string) => url.includes('/api/me/balances'));
    expect(balancesCalls.some((url: string) => !url.includes('year='))).toBe(true);
  });

  it('shows an error state when the balances request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  describe('Community Complaints', () => {
    const complaints = [
      {
        id: 'c1',
        title: 'Leaky pipe',
        possibleSolution: 'Call the plumber',
        owner: { id: 'owner-1', name: 'Alice Owner' },
        flat: { wing: 'A', flatNumber: '101' },
        upvoteCount: 5,
        myUpvoted: false,
      },
      {
        id: 'c2',
        title: 'Broken light',
        possibleSolution: 'Replace the tube light',
        owner: { id: 'owner-2', name: 'Bob Owner' },
        flat: { wing: 'B', flatNumber: '202' },
        upvoteCount: 1,
        myUpvoted: true,
      },
    ];

    it("shows every complaint for an OWNER, already ordered as the API returned them", async () => {
      mockFetch({ ...baseBalances, complaints: complaints.map((c) => ({ ...c })) });
      renderPage();

      await waitFor(() => expect(screen.getByText('Community Complaints')).toBeInTheDocument());
      const rows = screen.getAllByRole('row').slice(1); // drop header row
      expect(within(rows[0]).getByText('Leaky pipe')).toBeInTheDocument();
      expect(within(rows[0]).getByText('Call the plumber')).toBeInTheDocument();
      expect(within(rows[0]).getByText('Alice Owner')).toBeInTheDocument();
      expect(within(rows[0]).getByText('A-101')).toBeInTheDocument();
      expect(within(rows[0]).getByRole('button', { name: /upvote leaky pipe/i })).toHaveTextContent('5');
      expect(within(rows[1]).getByText('Broken light')).toBeInTheDocument();
      // c2's myUpvoted: true renders as a "remove upvote" toggle, already pressed.
      expect(
        within(rows[1]).getByRole('button', { name: /remove upvote from broken light/i }),
      ).toHaveAttribute('aria-pressed', 'true');
    });

    it('lets an owner upvote a complaint directly from the dashboard', async () => {
      const mutableComplaints = complaints.map((c) => ({ ...c }));
      mockFetch({ ...baseBalances, complaints: mutableComplaints });
      renderPage();
      const user = userEvent.setup();

      const upvoteButton = await screen.findByRole('button', { name: /upvote leaky pipe/i });
      await user.click(upvoteButton);

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /remove upvote from leaky pipe/i }),
        ).toHaveTextContent('6'),
      );
    });

    it('shows "No complaints yet." when there are none', async () => {
      mockFetch({ ...baseBalances, complaints: [] });
      renderPage();

      await waitFor(() => expect(screen.getByText(/no complaints yet/i)).toBeInTheDocument());
    });

    it('shows "No complaints yet." when the field is entirely omitted (e.g. an older API response)', async () => {
      mockFetch(baseBalances);
      renderPage();

      await waitFor(() => expect(screen.getByText(/no complaints yet/i)).toBeInTheDocument());
    });

    it('does not show the Community Complaints section for a TENANT', async () => {
      const tenantUser = { ...ownerUser, id: 'tenant-1', role: 'TENANT' as const };
      mockFetch({ ...baseBalances, complaints }, tenantUser);
      renderPage();

      await waitFor(() => expect(screen.getByText(/^total outstanding$/i)).toBeInTheDocument());
      expect(screen.queryByText('Community Complaints')).not.toBeInTheDocument();
    });
  });
});
