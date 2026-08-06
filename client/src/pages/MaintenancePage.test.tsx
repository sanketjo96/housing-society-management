import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../lib/auth-token';
import { MaintenancePage } from './MaintenancePage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  // retry: false — React Query's default 3 retries with backoff would outlast
  // waitFor's default 1s timeout on the error-state test below.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MaintenancePage />
    </QueryClientProvider>,
  );
}

const records = [
  {
    id: 'r1',
    period: '2026-07',
    payerType: 'OWNER' as const,
    amount: '2000',
    status: 'UNPAID' as const,
    dueDate: '2026-07-16',
    flat: { id: 'f1', wing: 'A', flatNumber: '101' },
  },
  {
    id: 'r2',
    period: '2026-06',
    payerType: 'OWNER' as const,
    amount: '1800',
    status: 'PAID' as const,
    dueDate: '2026-06-16',
    flat: { id: 'f1', wing: 'A', flatNumber: '101' },
  },
];

describe('MaintenancePage', () => {
  beforeEach(() => {
    setAccessToken('fake-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows the outstanding total and each record with its status', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => records });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('outstanding-total')).toHaveTextContent('₹2,000'));
    expect(screen.getByText('Unpaid')).toBeInTheDocument();
    expect(screen.getByText('Paid')).toBeInTheDocument();
    expect(screen.queryByText(/all settled/i)).not.toBeInTheDocument();
  });

  it('shows "All settled" when nothing is unpaid', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [records[1]] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/all settled/i)).toBeInTheDocument());
  });

  it('shows an empty state with no records', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no maintenance records yet/i)).toBeInTheDocument());
  });

  it('shows an error message on fetch failure', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: 'boom' }) });

    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('selecting an unpaid record shows a "Pay selected" bar with the running total', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => records });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByTestId('outstanding-total')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /pay selected/i })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText(/select jul 2026 for payment/i));

    expect(screen.getByRole('button', { name: /pay selected/i })).toBeInTheDocument();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  });

  it('a PAID record has no checkbox — only UNPAID records are selectable', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => records });

    renderPage();

    await waitFor(() => expect(screen.getByTestId('outstanding-total')).toBeInTheDocument());
    expect(screen.queryByLabelText(/select jun 2026 for payment/i)).not.toBeInTheDocument();
  });

  it('clicking "Pay selected" shows the QR code and lets the resident submit a proof', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let uploadedFormKeys: string[] | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/me/maintenance-records/qr')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ amount: 2000, upiLink: 'upi://pay?pa=a@b', qrDataUrl: 'data:image/png;base64,Zm9v' }),
        });
      }
      if (url.includes('/api/me/payment-proofs') && init?.method === 'POST') {
        uploadedFormKeys = Array.from((init!.body as FormData).keys());
        return Promise.resolve({ ok: true, json: async () => ({ id: 'proof-1', status: 'PENDING' }) });
      }
      if (url.includes('/api/me/maintenance-records')) {
        return Promise.resolve({ ok: true, json: async () => records });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByTestId('outstanding-total')).toBeInTheDocument());
    await user.click(screen.getByLabelText(/select jul 2026 for payment/i));
    await user.click(screen.getByRole('button', { name: /pay selected/i }));

    await waitFor(() => expect(screen.getByAltText(/upi payment qr code/i)).toBeInTheDocument());
    expect(screen.getByText('₹2,000')).toBeInTheDocument();

    const file = new File(['fake-image'], 'proof.jpg', { type: 'image/jpeg' });
    await user.upload(screen.getByLabelText(/upload payment proof/i), file);
    await user.click(screen.getByRole('button', { name: /submit proof/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/me/payment-proofs'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(uploadedFormKeys).toEqual(expect.arrayContaining(['file', 'maintenanceRecordIds']));

    // Uploading succeeds and returns to the passbook view.
    await waitFor(() => expect(screen.getByText('Maintenance passbook')).toBeInTheDocument());
  });
});
