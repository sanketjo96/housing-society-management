import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { FlatWiseDuesPage } from './FlatWiseDuesPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FlatWiseDuesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const flatDues = [
  {
    flat: { id: 'flat-1', wing: 'A', flatNumber: '101' },
    owner: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com', phone: null },
    currentTenant: null,
    paidTotal: 900,
    outstandingTotal: 1500,
    creditTotal: 0,
  },
  {
    flat: { id: 'flat-2', wing: 'A', flatNumber: '102' },
    owner: { id: 'owner-2', name: 'Bob Owner', email: 'bob@example.com', phone: null },
    currentTenant: { id: 'tenant-2', name: 'Carol Tenant', email: 'carol@example.com', phone: null },
    paidTotal: 800,
    outstandingTotal: 0,
    creditTotal: 300,
  },
];

function mockFetch() {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('/api/admin/dashboard/flat-dues')) {
      return Promise.resolve({ ok: true, json: async () => flatDues });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('FlatWiseDuesPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows the flat-wise dues table, including settled flats', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('A-102')).toBeInTheDocument(); // the ₹0 flat is still listed
  });

  it("indicates a tenant's presence under the owner's name, without a separate Tenant column", async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByText('Tenant: Carol Tenant')).toBeInTheDocument());
    expect(screen.queryByRole('columnheader', { name: 'Tenant' })).not.toBeInTheDocument();
  });

  it('shows each flat\'s available credit and does not show a Paid column', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByText('₹300')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Paid' })).not.toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Credit' })).toBeInTheDocument();
  });

  it('sorts the table when a sortable column header is clicked', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const table = screen.getByRole('table');

    const rowsBefore = within(table).getAllByRole('row').slice(1); // drop header row
    expect(rowsBefore[0]).toHaveTextContent('A-101');
    expect(rowsBefore[1]).toHaveTextContent('A-102');

    const userEvent = (await import('@testing-library/user-event')).default;
    await userEvent.click(within(table).getByRole('button', { name: 'Outstanding' }));
    const rowsDescending = within(table).getAllByRole('row').slice(1);
    expect(rowsDescending[0]).toHaveTextContent('A-101');
    expect(rowsDescending[1]).toHaveTextContent('A-102');
  });

  it('links back to the dashboard', async () => {
    mockFetch();
    renderPage();

    const link = await screen.findByRole('link', { name: /back to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('shows an error state when the request fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
