import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../context/AuthContext';
import { MyDetailsPage } from './MyDetailsPage';

type FetchMock = ReturnType<typeof vi.fn>;

const ownerUser = {
  id: 'owner-1',
  name: 'Alice Owner',
  email: 'alice@example.com',
  phone: null,
  role: 'OWNER' as const,
  societyId: 's1',
};

const tenantUser = {
  id: 'tenant-1',
  name: 'Bob Tenant',
  email: 'bob@example.com',
  phone: null,
  role: 'TENANT' as const,
  societyId: 's1',
};

const ownerOccupiedFlat = {
  id: 'flat-1',
  wing: 'A',
  flatNumber: '101',
  baseRate: '1500',
  owner: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com', phone: null },
  currentTenant: null,
  occupancyEffectiveFrom: null,
};

const tenantOccupiedFlat = {
  ...ownerOccupiedFlat,
  currentTenant: { id: 'tenant-1', name: 'Bob Tenant', email: 'bob@example.com', phone: null },
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MyDetailsPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function mockAuthAndFlat(
  user: typeof ownerUser | typeof tenantUser,
  flatResponse: { ok: boolean; status?: number; json: () => Promise<unknown> },
) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/auth/refresh')) {
      return Promise.resolve({ ok: true, json: async () => ({ accessToken: 'fake-token' }) });
    }
    if (url.includes('/api/auth/me')) {
      return Promise.resolve({ ok: true, json: async () => user });
    }
    if (url.includes('/api/me/flat')) {
      return Promise.resolve(flatResponse);
    }
    if (url.includes('/api/me')) {
      return Promise.resolve({ ok: true, json: async () => user });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('MyDetailsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('OWNER — combined flat form', () => {
    it('shows flat details (read-only) and owner details pre-filled', async () => {
      mockAuthAndFlat(ownerUser, { ok: true, json: async () => ownerOccupiedFlat });

      renderPage();

      await waitFor(() => expect(screen.getByDisplayValue('A')).toBeInTheDocument());
      expect(screen.getByDisplayValue('A')).toBeDisabled();
      expect(screen.getByDisplayValue('101')).toBeDisabled();
      expect(screen.getByDisplayValue('1500')).toBeDisabled();
      expect(screen.getByDisplayValue('Alice Owner')).not.toBeDisabled();
    });

    it('defaults to the owner-occupied toggle when there is no current tenant', async () => {
      mockAuthAndFlat(ownerUser, { ok: true, json: async () => ownerOccupiedFlat });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /owner-occupied/i })).toHaveAttribute('aria-pressed', 'true');
      });
      expect(screen.queryByText(/tenant details/i)).not.toBeInTheDocument();
    });

    it('pre-fills tenant details and shows the tenant-occupied toggle as active', async () => {
      mockAuthAndFlat(ownerUser, { ok: true, json: async () => tenantOccupiedFlat });

      renderPage();

      await waitFor(() => expect(screen.getByDisplayValue('Bob Tenant')).toBeInTheDocument());
      expect(screen.getByRole('button', { name: /tenant-occupied/i })).toHaveAttribute('aria-pressed', 'true');
    });

    it('saves the combined form via PUT /api/me/flat', async () => {
      mockAuthAndFlat(ownerUser, { ok: true, json: async () => ownerOccupiedFlat });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Alice Owner')).toBeInTheDocument());
      await user.clear(screen.getByDisplayValue('Alice Owner'));
      await user.type(screen.getByLabelText(/owner's full name/i), 'Alice Updated');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/me/flat'),
          expect.objectContaining({ method: 'PUT' }),
        );
      });
    });

    it('switching to tenant-occupied reveals the tenant details section', async () => {
      mockAuthAndFlat(ownerUser, { ok: true, json: async () => ownerOccupiedFlat });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Alice Owner')).toBeInTheDocument());
      await user.click(screen.getByRole('button', { name: /tenant-occupied/i }));

      expect(screen.getByText(/tenant details/i)).toBeInTheDocument();
    });
  });

  describe('TENANT — read-only flat, own profile only', () => {
    it('shows flat details read-only and no owner/occupancy editing controls', async () => {
      mockAuthAndFlat(tenantUser, { ok: true, json: async () => tenantOccupiedFlat });

      renderPage();

      await waitFor(() => expect(screen.getByDisplayValue('A')).toBeInTheDocument());
      expect(screen.queryByRole('button', { name: /owner-occupied/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /tenant-occupied/i })).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/owner's full name/i)).not.toBeInTheDocument();
    });

    it('saves the profile form via PATCH /api/me', async () => {
      mockAuthAndFlat(tenantUser, { ok: true, json: async () => tenantOccupiedFlat });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Bob Tenant')).toBeInTheDocument());
      await user.clear(screen.getByLabelText(/your full name/i));
      await user.type(screen.getByLabelText(/your full name/i), 'Bob Updated');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/me'),
          expect.objectContaining({ method: 'PATCH' }),
        );
      });
    });
  });

  it('shows the profile form and a note when no flat is linked yet', async () => {
    mockAuthAndFlat(ownerUser, { ok: false, status: 404, json: async () => ({ error: 'not found' }) });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no flat is linked/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/your full name/i)).toBeInTheDocument();
  });
});
