import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { OtherChargesPage } from './OtherChargesPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OtherChargesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const billedCharge = {
  id: 'oc-1',
  amount: '5000',
  note: 'Resale transfer',
  dueDate: '2026-09-01T00:00:00.000Z',
  createdAt: '2026-08-17T00:00:00.000Z',
  settlementStatus: 'UNPAID' as const,
  settledAmount: 0,
  payer: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com' },
  flat: { id: 'flat-1', wing: 'A', flatNumber: '101' },
  feeType: { id: 'ft-1', name: 'Transfer Fee' },
  billedBy: { id: 'admin-1', name: 'Society Admin' },
};

const flatOptions = [{ id: 'flat-1', wing: 'A', flatNumber: '101', owner: { name: 'Alice Owner' } }];
const feeTypeOptions = [{ id: 'ft-1', name: 'Transfer Fee' }];

describe('OtherChargesPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('lists billed charges with flat, custom fee, amount, and settlement status', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [billedCharge] });

    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('Transfer Fee')).toBeInTheDocument();
    expect(screen.getByText('₹5,000')).toBeInTheDocument();
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
  });

  it('bills a charge one flat at a time and returns to the list', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let billBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/api/admin/fee-types')) {
        return Promise.resolve({ ok: true, json: async () => feeTypeOptions });
      }
      if (init?.method === 'POST' && url.includes('/api/admin/other-charges')) {
        billBody = init.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ id: 'oc-2' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /bill a charge/i }));
    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());

    await user.selectOptions(screen.getByLabelText(/flat/i), 'flat-1');
    await user.selectOptions(screen.getByLabelText(/custom fee/i), 'ft-1');
    await user.type(screen.getByLabelText(/amount/i), '2500');
    await user.click(screen.getByRole('button', { name: /^bill this charge$/i }));

    await waitFor(() =>
      expect(JSON.parse(billBody!)).toEqual({ flatId: 'flat-1', feeTypeId: 'ft-1', amount: 2500, note: '' }),
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /bill a charge/i })).toBeInTheDocument());
  });

  it('shows a server error and stays on the form when billing fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/api/admin/fee-types')) {
        return Promise.resolve({ ok: true, json: async () => feeTypeOptions });
      }
      if (init?.method === 'POST' && url.includes('/api/admin/other-charges')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'This custom fee is not available for billing' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /bill a charge/i }));
    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/flat/i), 'flat-1');
    await user.selectOptions(screen.getByLabelText(/custom fee/i), 'ft-1');
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.click(screen.getByRole('button', { name: /^bill this charge$/i }));

    expect(await screen.findByText('This custom fee is not available for billing')).toBeInTheDocument();
  });

  // Page/form stay reachable when there's nothing to bill against (2026-08-26) —
  // a warning + link to go configure one, not a block.
  it('warns and disables the picker when no custom fees are configured, but still shows the form', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/api/admin/fee-types')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /bill a charge/i }));

    expect(await screen.findByText(/no custom fees are set up yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings → custom fees/i })).toHaveAttribute(
      'href',
      '/settings/fee-types',
    );
    expect(screen.getByLabelText(/custom fee/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /^bill this charge$/i })).toBeDisabled();
  });
});
