import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { PaymentProofsPage } from './PaymentProofsPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <PaymentProofsPage />
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

const depositEntry = {
  id: 'entry-1',
  type: 'DEPOSIT' as const,
  status: 'PENDING' as const,
  amount: '2000',
  note: 'UPI payment - awaiting review',
  fileUrl: 'some/key.jpg',
  createdAt: '2026-08-01T00:00:00.000Z',
  createdByType: 'OWNER' as const,
  category: 'MAINTENANCE' as const,
  payer: { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com' },
  flat: { id: 'f1', wing: 'A', flatNumber: '101' },
};

const depositEntryNoFile = {
  ...depositEntry,
  id: 'entry-2',
  amount: '500',
  fileUrl: null,
};

const creditEntry = {
  id: 'entry-3',
  type: 'CREDIT' as const,
  status: 'PENDING' as const,
  amount: '550',
  note: 'Plumber repair for the common water tank',
  // A Credit's proof is mandatory at creation (unlike a Deposit's optional
  // screenshot) — always has a fileUrl in practice.
  fileUrl: 'credits/proof.jpg',
  createdAt: '2026-08-01T00:00:00.000Z',
  createdByType: 'OWNER' as const,
  category: 'MAINTENANCE' as const,
  payer: { id: 'owner-2', name: 'Bob Owner', email: 'bob@example.com' },
  flat: { id: 'f2', wing: 'B', flatNumber: '201' },
};

const approvedEntry = { ...depositEntry, id: 'entry-4', status: 'APPROVED' as const };

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

  it('lists pending entries with flat, payer, and amount', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [depositEntry] });

    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('₹2,000')).toBeInTheDocument();
  });

  it('excludes an entry with no proof attached from the queue entirely', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [depositEntryNoFile] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no pending entries/i)).toBeInTheDocument());
    expect(screen.queryByText('A-101')).not.toBeInTheDocument();
  });

  it('lists a fileless entry alongside one with a proof, showing only the latter', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [depositEntry, depositEntryNoFile] });

    renderPage();

    await waitFor(() => expect(screen.getByText('₹2,000')).toBeInTheDocument());
    expect(screen.queryByText('₹500')).not.toBeInTheDocument();
  });

  it('shows a Type column distinguishing Deposit from Credit rows, and a Credit row\'s required reason note', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [depositEntry, creditEntry] });

    renderPage();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText('Deposit')).toBeInTheDocument();
    expect(screen.getByText('Credit')).toBeInTheDocument();
    expect(screen.getByText('Plumber repair for the common water tank')).toBeInTheDocument();
  });

  it('shows an empty state when there is nothing pending', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no pending entries/i)).toBeInTheDocument());
  });

  it('clicking Approve opens the receipt validation modal without settling the entry', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/receipt-preview')) {
        return Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-fake']) });
      }
      if (url.includes('/approve')) {
        return Promise.resolve({ ok: true, json: async () => ({ ...depositEntry, status: 'APPROVED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [depositEntry] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^approve$/i }));

    expect(await screen.findByRole('dialog', { name: /confirm receipt/i })).toBeInTheDocument();
    // No approve call yet — only the preview was fetched.
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/ledger-entries/entry-1/approve'),
      expect.anything(),
    );
  });

  it('Cancel closes the modal and leaves the entry pending, with no approve call', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/receipt-preview')) {
        return Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-fake']) });
      }
      return Promise.resolve({ ok: true, json: async () => [depositEntry] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    await screen.findByRole('dialog', { name: /confirm receipt/i });

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/ledger-entries/entry-1/approve'),
      expect.anything(),
    );
  });

  it('Confirm and approve in the modal settles the entry', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/receipt-preview')) {
        return Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-fake']) });
      }
      if (url.includes('/approve')) {
        return Promise.resolve({ ok: true, json: async () => ({ ...depositEntry, status: 'APPROVED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [depositEntry] });
    });

    const { queryClient } = renderPage();
    // Simulates the Receipt Book page's own query already sitting in the cache
    // (e.g. the admin visited it earlier) — this is what would go stale/miss the
    // new receipt if this mutation didn't invalidate it too.
    queryClient.setQueryData(['admin-receipts'], []);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^approve$/i }));
    await screen.findByRole('dialog', { name: /confirm receipt/i });

    await user.click(screen.getByRole('button', { name: /confirm and approve/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/ledger-entries/entry-1/approve'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Approval also issues a real Receipt — Receipt Book's cached list must be
    // invalidated too, or a 30s-fresh cache would silently miss it.
    await waitFor(() =>
      expect(queryClient.getQueryState(['admin-receipts'])?.isInvalidated).toBe(true),
    );
  });

  it('rejects an entry with a reason', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let rejectBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/reject')) {
        rejectBody = init?.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ ...depositEntry, status: 'REJECTED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [depositEntry] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^reject$/i }));
    await user.type(screen.getByLabelText(/rejection reason/i), 'Blurry screenshot');
    await user.click(screen.getByRole('button', { name: /confirm reject/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/ledger-entries/entry-1/reject'),
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
      return Promise.resolve({ ok: true, json: async () => [depositEntry] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /view proof/i }));

    await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:fake-url', '_blank'));
  });

  it('the Approved tab shows a Download receipt action instead of Approve/Reject', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('status=APPROVED')) {
        return Promise.resolve({ ok: true, json: async () => [approvedEntry] });
      }
      if (url.includes('/receipt') && !url.includes('preview')) {
        return Promise.resolve({ ok: true, blob: async () => new Blob(['%PDF-fake']) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /approved/i }));
    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument();
    const downloadButton = screen.getByRole('button', { name: /download receipt/i });
    await user.click(downloadButton);

    await waitFor(() => expect(window.open).toHaveBeenCalledWith('blob:fake-url', '_blank'));
  });

  it('the Approved tab excludes a fileless entry (e.g. manually marked paid), same as Pending', async () => {
    const manuallyPaidEntry = {
      ...approvedEntry,
      id: 'entry-5',
      fileUrl: null,
      createdByType: 'ADMIN' as const,
    };
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('status=APPROVED')) {
        return Promise.resolve({ ok: true, json: async () => [approvedEntry, manuallyPaidEntry] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /approved/i }));

    await waitFor(() => expect(screen.getByText('₹2,000')).toBeInTheDocument());
    expect(screen.queryByText(/no file attached/i)).not.toBeInTheDocument();
  });

  it('the Rejected tab still shows a fileless entry, unlike Pending and Approved', async () => {
    const rejectedNoFile = { ...depositEntryNoFile, id: 'entry-6', status: 'REJECTED' as const };
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('status=REJECTED')) {
        return Promise.resolve({ ok: true, json: async () => [rejectedNoFile] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /rejected/i }));

    await waitFor(() => expect(screen.getByText('A-101')).toBeInTheDocument());
    expect(screen.getByText(/no file attached/i)).toBeInTheDocument();
  });

  it('shows a Created by column distinguishing an admin-created entry from a resident-created one', async () => {
    const adminCreated = { ...depositEntry, id: 'entry-7', createdByType: 'ADMIN' as const };
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [depositEntry, adminCreated] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Owner')).toBeInTheDocument());
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });

  const flatOptions = [
    { id: 'f1', wing: 'A', flatNumber: '101', owner: { name: 'Alice Owner' } },
    { id: 'f2', wing: 'B', flatNumber: '201', owner: { name: 'Bob Owner' } },
  ];

  it('Mark as paid: opens the modal, submits, and shows a success confirmation instead of auto-closing', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let manualDepositBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/manual-deposit')) {
        manualDepositBody = init?.body as string;
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'entry-9', status: 'APPROVED' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    const { queryClient } = renderPage();
    // Simulates these pages' own queries already sitting in the cache (e.g. the
    // admin visited them earlier) — this is what would go stale/miss the update
    // if this mutation didn't invalidate them too.
    queryClient.setQueryData(['admin-receipts'], []);
    queryClient.setQueryData(['admin-dashboard-summary'], {});
    queryClient.setQueryData(['admin-other-charges'], []);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /mark as paid/i }));
    await screen.findByRole('dialog', { name: /mark as paid/i });

    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/flat/i), 'f1');
    await user.type(screen.getByLabelText(/amount/i), '500');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^mark as paid$/i }));

    await waitFor(() => expect(screen.getByText(/marked as paid/i)).toBeInTheDocument());
    expect(JSON.parse(manualDepositBody!)).toEqual({ flatId: 'f1', amount: 500, category: 'MAINTENANCE' });

    // manualDeposit also issues a real Receipt — Receipt Book's cached list must
    // be invalidated too, or a 30s-fresh cache would silently miss it (this is the
    // exact bug report this test guards against).
    expect(queryClient.getQueryState(['admin-receipts'])?.isInvalidated).toBe(true);

    // Affects one of the two pools (docs/other-charges/) — the admin dashboard's
    // cards and (if applicable) the Other Charges list must refresh too.
    expect(queryClient.getQueryState(['admin-dashboard-summary'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['admin-other-charges'])?.isInvalidated).toBe(true);
  });

  it('Mark as paid: selecting Other Charge sends category=OTHER_CHARGE', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let manualDepositBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/manual-deposit')) {
        manualDepositBody = init?.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ id: 'entry-10', status: 'APPROVED' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /mark as paid/i }));
    await screen.findByRole('dialog', { name: /mark as paid/i });

    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/flat/i), 'f1');
    await user.type(screen.getByLabelText(/amount/i), '750');
    await user.selectOptions(screen.getByLabelText(/category/i), 'OTHER_CHARGE');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^mark as paid$/i }));

    await waitFor(() => expect(screen.getByText(/marked as paid/i)).toBeInTheDocument());
    expect(JSON.parse(manualDepositBody!)).toEqual({ flatId: 'f1', amount: 750, category: 'OTHER_CHARGE' });

    // Still open, showing the confirmation — doesn't auto-close into the table
    // (the created entry has no fileUrl, so it wouldn't appear there anyway).
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Mark as paid: shows the server error and keeps the form open on an invalid amount', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/flats')) {
        return Promise.resolve({ ok: true, json: async () => flatOptions });
      }
      if (url.includes('/manual-deposit')) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ error: 'Amount must be greater than 0' }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /mark as paid/i }));
    await screen.findByRole('dialog', { name: /mark as paid/i });

    await waitFor(() => expect(screen.getByText(/A-101 — Alice Owner/)).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/flat/i), 'f1');
    await user.type(screen.getByLabelText(/amount/i), '10');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^mark as paid$/i }));

    expect(await screen.findByText('Amount must be greater than 0')).toBeInTheDocument();
    expect(screen.queryByText(/marked as paid/i)).not.toBeInTheDocument();
  });
});
