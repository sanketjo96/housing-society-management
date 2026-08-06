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
  block: 'A',
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
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MyDetailsPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

function mockAuthAndFlat(user: typeof ownerUser | typeof tenantUser, flatResponse: { ok: boolean; status?: number; json: () => Promise<unknown> }) {
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

  it('shows flat details (read-only) and the owner’s own profile pre-filled', async () => {
    mockAuthAndFlat(ownerUser, { ok: true, json: async () => ownerOccupiedFlat });

    renderPage();

    await waitFor(() => expect(screen.getByDisplayValue('A')).toBeInTheDocument());
    expect(screen.getByDisplayValue('A')).toBeDisabled();
    expect(screen.getByDisplayValue('101')).toBeDisabled();
    expect(screen.getByDisplayValue('Alice Owner')).not.toBeDisabled();
  });

  it('shows "Add tenant" for an owner-occupied flat, with no current tenant', async () => {
    mockAuthAndFlat(ownerUser, { ok: true, json: async () => ownerOccupiedFlat });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add tenant/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/owner-occupied/i)).toBeInTheDocument();
  });

  it('pre-fills and can remove the current tenant for a tenant-occupied flat', async () => {
    mockAuthAndFlat(ownerUser, { ok: true, json: async () => tenantOccupiedFlat });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('Bob Tenant')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /remove tenant/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/me/flat/tenant'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('does not show the occupancy section for a TENANT role', async () => {
    mockAuthAndFlat(tenantUser, { ok: true, json: async () => tenantOccupiedFlat });

    renderPage();

    await waitFor(() => expect(screen.getByDisplayValue('Bob Tenant')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /remove tenant/i })).not.toBeInTheDocument();
  });

  it('saves the profile form via PATCH /api/me', async () => {
    mockAuthAndFlat(ownerUser, { ok: true, json: async () => ownerOccupiedFlat });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('Alice Owner')).toBeInTheDocument());
    await user.clear(screen.getByDisplayValue('Alice Owner'));
    await user.type(screen.getAllByLabelText(/full name/i)[0], 'Alice Updated');

    const saveButtons = screen.getAllByRole('button', { name: /save changes/i });
    await user.click(saveButtons[0]);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/me'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });
});
