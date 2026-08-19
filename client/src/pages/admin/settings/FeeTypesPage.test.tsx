import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../../lib/auth-token';
import { FeeTypesPage } from './FeeTypesPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <FeeTypesPage />
    </QueryClientProvider>,
  );
}

const activeFeeType = { id: 'ft-1', name: 'Transfer Fee', description: 'Charged on resale', isActive: true };
const inactiveFeeType = { id: 'ft-2', name: 'Old Fee', description: null, isActive: false };

describe('FeeTypesPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('lists fee types with their active/inactive status', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [activeFeeType, inactiveFeeType] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Transfer Fee')).toBeInTheDocument());
    expect(screen.getByText('Charged on resale')).toBeInTheDocument();
    expect(screen.getByText('Old Fee')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('shows an empty state with nothing yet', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no fee types yet/i)).toBeInTheDocument());
  });

  it('opens the add form, submits, and returns to the list', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let createBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.includes('/api/admin/fee-types')) {
        createBody = init.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ id: 'ft-3', name: 'Fine', isActive: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /add fee type/i }));
    await user.type(screen.getByLabelText(/^name$/i), 'Fine');
    await user.click(screen.getByRole('button', { name: /save fee type/i }));

    await waitFor(() => expect(JSON.parse(createBody!)).toEqual({ name: 'Fine', description: '' }));
    // Back to the list view.
    await waitFor(() => expect(screen.getByRole('button', { name: /add fee type/i })).toBeInTheDocument());
  });

  it('toggling an active fee type deactivates it — never deletes', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let patchBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && url.includes(`/api/admin/fee-types/${activeFeeType.id}`)) {
        patchBody = init.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ ...activeFeeType, isActive: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => [activeFeeType] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Transfer Fee')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /deactivate/i }));

    await waitFor(() => expect(JSON.parse(patchBody!)).toEqual({ isActive: false }));
  });
});
