import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { DashboardPage } from './DashboardPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderDashboard() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
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
    if (url.includes('/api/me/ledger')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          entries: [],
          totals: { totalCharges: 0, approvedDeposits: 0, approvedCredits: 0, outstanding: 0, creditBalance: 0, payable: 0 },
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
    if (url.includes('/api/admin/dashboard/flagged-flats')) {
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

  it('shows Dashboard, Passbook, and My details tabs for an OWNER', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tab', { name: /^dashboard$/i })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /passbook/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /my details/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /flats and residents/i })).not.toBeInTheDocument();
  });

  it('shows only the admin tabs (Dashboard, Flats and residents, Payment proofs, Settings) for an ADMIN', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderDashboard();

    await waitFor(() => expect(screen.getByRole('tab', { name: /flats and residents/i })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /payment proofs/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^settings$/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /passbook/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /my details/i })).not.toBeInTheDocument();
  });

  it('switches to the Payment proofs tab', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderDashboard();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('tab', { name: /payment proofs/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /payment proofs/i }));

    await waitFor(() => expect(screen.getByText(/no pending proofs/i)).toBeInTheDocument());
  });

  it('switches to the Settings tab and shows the current billing defaults', async () => {
    mockAuth({ id: '1', name: 'Admin', email: 'admin@example.com', phone: null, role: 'ADMIN', societyId: 's1' });
    renderDashboard();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('tab', { name: /^settings$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /^settings$/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('1500')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('1.5')).toBeInTheDocument();
  });

  it('switches to the Passbook tab content on click', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderDashboard();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(/dashboard widgets are coming/i)).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /passbook/i }));

    await waitFor(() => {
      expect(screen.getByText(/nothing payable right now/i)).toBeInTheDocument();
    });
  });

  it('switches to the My details tab content on click', async () => {
    mockAuth({ id: '1', name: 'Alice', email: 'alice@example.com', phone: null, role: 'OWNER', societyId: 's1' });
    renderDashboard();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(/dashboard widgets are coming/i)).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /my details/i }));

    await waitFor(() => {
      expect(screen.getByText(/no flat is linked to your account/i)).toBeInTheDocument();
    });
  });
});
