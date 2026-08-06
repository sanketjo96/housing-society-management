import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { FlatsListPage } from './FlatsListPage';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FlatsListPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

const untenantedFlat = {
  id: 'flat-1',
  block: 'A',
  flatNumber: '101',
  baseRate: '1500',
  owner: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com', phone: null },
  currentTenant: null,
};

const tenantedFlat = {
  id: 'flat-2',
  block: 'A',
  flatNumber: '102',
  baseRate: '1600',
  owner: { id: 'owner-2', name: 'Carol Owner', email: 'carol@example.com', phone: null },
  currentTenant: { id: 'tenant-1', name: 'Bob Tenant', email: 'bob@example.com', phone: null },
};

describe('FlatsListPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('lists flats with owner/occupancy/tenant info', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => [untenantedFlat, tenantedFlat] });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('A-101')).toBeInTheDocument();
    });
    expect(screen.getByText('A-102')).toBeInTheDocument();
    expect(screen.getByText('Bob Tenant')).toBeInTheDocument();
    // "Owner"/"Tenant" also appear as column headers, so assert at least one
    // occurrence rather than a single unique match.
    expect(screen.getAllByText('Owner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tenant').length).toBeGreaterThan(0);
  });

  it('opens the onboard form and submits an owner-occupied flat', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/import')) {
        return Promise.reject(new Error('unexpected import call'));
      }
      if (url.endsWith('/api/admin/flats') && init?.method === 'POST') {
        return Promise.resolve({ ok: true, json: async () => untenantedFlat });
      }
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('button', { name: /onboard a flat/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /onboard a flat/i }));

    await user.type(screen.getByLabelText(/^block$/i), 'A');
    await user.type(screen.getByLabelText(/flat number/i), '101');
    await user.type(screen.getByLabelText(/base maintenance rate/i), '1500');
    await user.type(screen.getByLabelText(/full name/i), 'Alice Owner');
    await user.type(screen.getByLabelText(/^email$/i), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /save flat/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/flats'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const [, postCall] = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    const sentBody = JSON.parse((postCall as RequestInit).body as string);
    expect(sentBody.ownerEmail).toBe('alice@example.com');
    expect(sentBody.occupancy).toBe('owner');
  });

  it('shows tenant fields and requires them when occupancy is switched to tenant', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByRole('button', { name: /onboard a flat/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /onboard a flat/i }));

    await user.click(screen.getByRole('button', { name: /tenant-occupied/i }));
    expect(screen.getByText(/tenant details/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^block$/i), 'A');
    await user.type(screen.getByLabelText(/flat number/i), '101');
    await user.type(screen.getByLabelText(/base maintenance rate/i), '1500');
    await user.type(screen.getByPlaceholderText(/owner's full name/i), 'Alice Owner');
    await user.type(screen.getByPlaceholderText('owner@example.com'), 'alice@example.com');
    await user.click(screen.getByRole('button', { name: /save flat/i }));

    await waitFor(() => {
      expect(screen.getByText(/tenant name and email are required/i)).toBeInTheDocument();
    });
  });

  it('opens the edit form pre-filled for an existing flat', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [tenantedFlat] });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-102')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit/i }));

    await waitFor(() => expect(screen.getByDisplayValue('Carol Owner')).toBeInTheDocument());
    expect(screen.getByDisplayValue('A')).toBeDisabled();
    expect(screen.getByDisplayValue('Bob Tenant')).toBeInTheDocument();
  });

  it('imports a CSV and shows per-row results', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/import')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ created: [{ id: 'x' }], errors: [{ row: 3, message: 'Missing required value(s)' }] }),
        });
      }
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText(/bulk import/i)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^import$/i }));

    await waitFor(() => {
      expect(screen.getByText(/1 flat\(s\) created/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/missing required value/i)).toBeInTheDocument();
  });
});
