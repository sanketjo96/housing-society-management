import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
        json: async () => ({ totalBilled: 0, totalPaid: 0, outstandingTotal: 0, pendingReviewTotal: 0, collectionRatePercent: 0 }),
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

  it('shows only the admin nav links (Dashboard, Payment proofs, Billing plan) for an ADMIN', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /payment proofs/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /billing plan/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /maintenance book/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /my details/i })).not.toBeInTheDocument();
    // Flats and residents, Tenants, and Flat-wise dues are real routes but no longer
    // sidebar nav items — reached only via dashboard tiles.
    expect(screen.queryByRole('link', { name: /flats and residents/i })).not.toBeInTheDocument();
  });

  it('the nav links are real top-level URLs, not sub-paths of /dashboard', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();

    await waitFor(() => expect(screen.getByRole('link', { name: /payment proofs/i })).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /payment proofs/i })).toHaveAttribute('href', '/payment-proofs');
    expect(screen.getByRole('link', { name: /billing plan/i })).toHaveAttribute('href', '/settings/billing');
  });

  it('switches to the Payment proofs page on click', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderApp();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('link', { name: /payment proofs/i })).toBeInTheDocument());
    await user.click(screen.getByRole('link', { name: /payment proofs/i }));

    await waitFor(() => expect(screen.getByText(/no pending entries/i)).toBeInTheDocument());
  });

  it('switches to the Maintenance Book page on click', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderApp();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('link', { name: /maintenance book/i })).toBeInTheDocument());
    await user.click(screen.getByRole('link', { name: /maintenance book/i }));

    await waitFor(() => {
      expect(screen.getByText(/no maintenance records yet/i)).toBeInTheDocument();
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
