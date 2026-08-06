import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { PaymentProofsPage } from './PaymentProofsPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <PaymentProofsPage />
    </QueryClientProvider>,
  );
}

const proof = {
  id: 'proof-1',
  status: 'PENDING' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  uploadedBy: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com' },
  maintenanceRecords: [
    { id: 'rec-1', period: '2026-07', amount: '2000', flat: { id: 'f1', wing: 'A', flatNumber: '101' } },
  ],
};

describe('PaymentProofsPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('lists pending proofs with flat, uploader, and amount', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [proof] });

    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
  });

  it('shows an empty state when there is nothing pending', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no pending proofs/i)).toBeInTheDocument());
  });

  it('approves a proof', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/approve')) {
        return Promise.resolve({ ok: true, json: async () => ({ ...proof, status: 'APPROVED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [proof] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/payment-proofs/proof-1/approve'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('rejects a proof with a reason', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let rejectBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/reject')) {
        rejectBody = init?.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ ...proof, status: 'REJECTED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [proof] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^reject$/i }));
    await user.type(screen.getByLabelText(/rejection reason/i), 'Blurry screenshot');
    await user.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/payment-proofs/proof-1/reject'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(JSON.parse(rejectBody!)).toEqual({ reason: 'Blurry screenshot' });
  });

  it('opens the proof file in a new tab via an authenticated fetch', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/file')) {
        return Promise.resolve({ ok: true, blob: async () => new Blob(['x']) });
      }
      return Promise.resolve({ ok: true, json: async () => [proof] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /view proof/i }));

    await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:fake-url', '_blank'));
  });
});
