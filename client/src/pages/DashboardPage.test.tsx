import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { DashboardPage } from './DashboardPage';

// DashboardPage is only the "/dashboard" route's content now (see App.tsx /
// DashboardLayout) — it just picks AdminDashboardPage vs ResidentDashboardOverview
// by role. Nav rendering and cross-page routing moved to
// components/DashboardLayout.test.tsx, which is where that's covered now.
type FetchMock = ReturnType<typeof vi.fn>;

function renderDashboard() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <DashboardPage />
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

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the resident overview (Passbook content) for an OWNER', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/nothing outstanding right now/i)).toBeInTheDocument();
    });
  });

  it('shows the admin overview for an ADMIN', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/maintenance outstanding total/i)).toBeInTheDocument();
    });
  });
});
