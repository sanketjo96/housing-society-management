import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { FlatsListPage } from '../pages/admin/FlatsListPage';
import { PaymentProofsPage } from '../pages/admin/PaymentProofsPage';
import { BillingPlanPage } from '../pages/admin/settings/BillingPlanPage';
import { DashboardPage } from '../pages/DashboardPage';
import { MaintenanceBookPage } from '../pages/MaintenanceBookPage';
import { MyDetailsPage } from '../pages/MyDetailsPage';
import { DashboardLayout } from './DashboardLayout';
import { ProtectedRoute } from './ProtectedRoute';

type FetchMock = ReturnType<typeof vi.fn>;

// A trimmed mirror of App.tsx's real route table — DashboardLayout only makes
// sense mounted as a layout route over sibling top-level pages (that's the whole
// point of this refactor: Dashboard is one page among several, not a container
// every other page lives under), so exercising it standalone means rebuilding
// that same shape here rather than rendering DashboardLayout in isolation.
function renderApp(initialPath = '/dashboard') {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AuthProvider>
          <Routes>
            <Route
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/flats" element={<ProtectedRoute allowedRoles={['ADMIN']}><FlatsListPage /></ProtectedRoute>} />
              <Route
                path="/payment-proofs"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><PaymentProofsPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/billing"
                element={<ProtectedRoute allowedRoles={['ADMIN']}><BillingPlanPage /></ProtectedRoute>}
              />
              <Route
                path="/maintenance-book"
                element={<ProtectedRoute allowedRoles={['OWNER', 'TENANT']}><MaintenanceBookPage /></ProtectedRoute>}
              />
              <Route
                path="/my-details"
                element={<ProtectedRoute allowedRoles={['OWNER', 'TENANT']}><MyDetailsPage /></ProtectedRoute>}
              />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockAuth(user: { id: string; name: string; email: string; phone: string | null; role: string; societyId: string }) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/auth/refresh')) {
      return Promise.resolve({ ok: true, json: async () => ({ accessToken: 'fake-token' }) });
    }
    if (url.endsWith('/api/auth/me')) {
      return Promise.resolve({ ok: true, json: async () => user });
    }
    if (url.includes('/api/me/ledger/deposits/intent')) {
      return Promise.resolve({ ok: true, json: async () => ({ intent: null }) });
    }
    if (url.includes('/api/me/balances')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          maintenance: { outstanding: 0, availableCredit: 0 },
          otherCharges: { outstanding: 0 },
          totalOutstanding: 0,
        }),
      });
    }
    if (url.includes('/api/me/ledger')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          entries: [],
          totals: { totalCharges: 0, approvedDeposits: 0, approvedCredits: 0, outstanding: 0, availableCredit: 0 },
          yearTotals: { totalCharges: 0, approvedDeposits: 0, approvedCredits: 0, outstanding: 0, availableCredit: 0 },
          availableYears: [new Date().getFullYear()],
        }),
      });
    }
    if (url.includes('/api/me/flat')) {
      return Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'not found' }) });
    }
    if (url.includes('/api/admin/flats')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/api/admin/settings')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          name: 'Sunrise Residency',
          upiVpa: 'sunrise-residency@okhdfcbank',
          tenantRateFactor: 1.5,
          defaultBaseRate: 1500,
        }),
      });
    }
    if (url.includes('/api/admin/dashboard/summary')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          totalBilled: 0,
          totalPaid: 0,
          outstandingTotal: 0,
          pendingReviewTotal: 0,
          collectionRatePercent: 0,
          otherChargesOutstandingTotal: 0,
          totalOutstandingTotal: 0,
          societyTotalIncome: 0,
          societyTotalExpense: 0,
          societyNetPosition: 0,
        }),
      });
    }
    if (url.includes('/api/admin/dashboard/flat-dues')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (url.includes('/api/admin/ledger-entries')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('DashboardLayout', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows Dashboard, Maintenance Book, and My details nav links for an OWNER', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /^dashboard$/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /maintenance book/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my details/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /flats and residents/i })).not.toBeInTheDocument();
  });

  it('shows the admin nav in order (Dashboard, Custom Bills, Resident Book, Manage Finance, Settings) for an ADMIN, with both submenus collapsed by default', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('button', { name: /^settings$/i })).toBeInTheDocument());
    const nav = screen.getByRole('navigation', { name: /dashboard sections/i });
    const labels = within(nav)
      .getAllByRole('link')
      .map((el) => el.textContent)
      .concat(
        within(nav).getByRole('button', { name: /^manage finance$/i }).textContent ?? '',
        within(nav).getByRole('button', { name: /^settings$/i }).textContent ?? '',
      );
    // Dashboard, Custom Bills, Resident Book are direct links; Manage Finance and
    // Settings are collapsed group toggles — their children (Record/Mark
    // Paid/Receipt Book, and Society details/Billing plan/Fee types/Finance
    // categories respectively) aren't links yet.
    expect(labels[0]).toMatch(/dashboard/i);
    expect(labels[1]).toMatch(/custom bills/i);
    expect(labels[2]).toMatch(/resident book/i);
    expect(labels[3]).toMatch(/manage finance/i);
    expect(labels[4]).toMatch(/settings/i);

    expect(screen.queryByRole('link', { name: /^record$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /mark paid/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /receipt book/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /society details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /billing plan/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /fee types/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /maintenance book/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my details/i })).not.toBeInTheDocument();
    // Flats and residents, Tenants, Flat-wise/Other charges dues, and Payment
    // proofs are all real routes but not sidebar nav items — reached only via
    // dashboard tiles.
    expect(screen.queryByRole('link', { name: /flats and residents/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^payment proofs$/i })).not.toBeInTheDocument();
  });

  it('expands the Manage Finance submenu on click, revealing Record, Mark Paid, and Receipt Book as real top-level URLs', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^manage finance$/i }));

    expect(screen.getByRole('link', { name: /^record$/i })).toHaveAttribute('href', '/manage-finance');
    expect(screen.getByRole('link', { name: /mark paid/i })).toHaveAttribute('href', '/mark-as-paid');
    expect(screen.getByRole('link', { name: /receipt book/i })).toHaveAttribute('href', '/receipt-book');

    // Toggling again collapses it.
    await user.click(screen.getByRole('button', { name: /^manage finance$/i }));
    expect(screen.queryByRole('link', { name: /^record$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /mark paid/i })).not.toBeInTheDocument();
  });

  it('links "Custom Bills" to /other-charges', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /custom bills/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /custom bills/i })).toHaveAttribute('href', '/other-charges');
  });

  it('links "Resident Book" to /resident-ledger', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /resident book/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /resident book/i })).toHaveAttribute('href', '/resident-ledger');
  });

  it('expands the Settings submenu on click, revealing Society details, Billing plan, and Fee types as real top-level URLs', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /^settings$/i }));

    expect(screen.getByRole('link', { name: /society details/i })).toHaveAttribute('href', '/settings/society');
    expect(screen.getByRole('link', { name: /billing plan/i })).toHaveAttribute('href', '/settings/billing');
    expect(screen.getByRole('link', { name: /fee types/i })).toHaveAttribute('href', '/settings/fee-types');

    // Toggling again collapses it.
    await user.click(screen.getByRole('button', { name: /^settings$/i }));
    expect(screen.queryByRole('link', { name: /society details/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /billing plan/i })).not.toBeInTheDocument();
  });

  it('deep-links straight into Payment proofs from the URL', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp('/payment-proofs');

    await waitFor(() => expect(screen.getByText(/no pending entries/i)).toBeInTheDocument());
  });

  it('switches to the Maintenance Book page on click', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderApp();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('link', { name: /maintenance book/i })).toBeInTheDocument());
    await user.click(screen.getByRole('link', { name: /maintenance book/i }));

    // Maintenance Book defaults to the Payment History tab now.
    await waitFor(() => {
      expect(screen.getByText(/no payments yet/i)).toBeInTheDocument();
    });
  });

  it('deep-links straight into a resident page from the URL, without clicking any nav link', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderApp('/my-details');

    await waitFor(() => {
      expect(screen.getByText(/no flat is linked to your account/i)).toBeInTheDocument();
    });
  });

  it('deep-links straight into an admin settings page from the URL, without clicking any nav link', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp('/settings/billing');

    await waitFor(() => {
      expect(screen.getByDisplayValue('1500')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('1.5')).toBeInTheDocument();
  });

  it('shows access-denied rather than resident content when a resident deep-links an admin-only page', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderApp('/flats');

    await waitFor(() => {
      expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    });
  });
});
