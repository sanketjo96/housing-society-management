import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { ManageFinancePage } from './ManageFinancePage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManageFinancePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const expenseCategory = { id: 'cat-1', name: 'Security Guard Salary', direction: 'EXPENSE' as const };

describe('ManageFinancePage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  // Page/form stay reachable when there's nothing to record against for the
  // currently selected direction (2026-08-26) — a warning + link to go configure
  // one, not a block, same pattern as OtherChargesPage.tsx's Custom Fee warning.
  it('warns and disables the picker when no categories exist for the selected direction, but still shows the form', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/finance-categories')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /record a transaction/i }));

    expect(await screen.findByText(/no expense categories are set up yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /settings → finance categories/i })).toHaveAttribute(
      'href',
      '/settings/finance-categories',
    );
    expect(screen.getByLabelText(/category/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /record transaction/i })).toBeDisabled();
  });

  it('hides the warning and enables the picker once a category exists for the selected direction', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/finance-categories')) {
        return Promise.resolve({ ok: true, json: async () => [expenseCategory] });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /record a transaction/i }));

    await waitFor(() => expect(screen.getByLabelText(/category/i)).toBeEnabled());
    expect(screen.queryByText(/no expense categories are set up yet/i)).not.toBeInTheDocument();
  });

  describe('bank reference OCR infer', () => {
    function mockFetchWithCategory() {
      const fetchMock = fetch as unknown as FetchMock;
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/admin/finance-categories')) {
          return Promise.resolve({ ok: true, json: async () => [expenseCategory] });
        }
        if (url.includes('/api/admin/society-ledger/ocr-extract')) {
          return Promise.resolve({ ok: true, json: async () => ({ bankReference: 'UTR555666777' }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
    }

    it('does not show the reference field or Infer button when payment method is Cash (the default)', async () => {
      mockFetchWithCategory();
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /record a transaction/i }));
      await screen.findByLabelText(/category/i);

      expect(screen.queryByRole('button', { name: /infer from proof/i })).not.toBeInTheDocument();
    });

    it('keeps the Infer button disabled until a proof file is attached', async () => {
      mockFetchWithCategory();
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /record a transaction/i }));
      await user.selectOptions(screen.getByLabelText(/payment method/i), 'UPI');

      expect(screen.getByRole('button', { name: /infer from proof/i })).toBeDisabled();
      expect(screen.getByText(/attach the proof above/i)).toBeInTheDocument();
    });

    it('infers and pre-fills the bank reference from the attached proof', async () => {
      mockFetchWithCategory();
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /record a transaction/i }));
      await user.selectOptions(screen.getByLabelText(/payment method/i), 'UPI');

      const file = new File(['fake-bytes'], 'bill.png', { type: 'image/png' });
      await user.upload(screen.getByLabelText(/attach a bill, invoice, or receipt/i, { selector: 'input' }), file);

      const inferButton = screen.getByRole('button', { name: /infer from proof/i });
      expect(inferButton).toBeEnabled();
      await user.click(inferButton);

      await waitFor(() => {
        expect(fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/society-ledger/ocr-extract'),
          expect.objectContaining({ method: 'POST' }),
        );
      });
      await waitFor(() =>
        expect(screen.getByPlaceholderText(/utr \/ cheque number/i)).toHaveValue('UTR555666777'),
      );
    });

    it('shows a message and leaves the field blank when nothing is detected', async () => {
      const fetchMock = fetch as unknown as FetchMock;
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/admin/finance-categories')) {
          return Promise.resolve({ ok: true, json: async () => [expenseCategory] });
        }
        if (url.includes('/api/admin/society-ledger/ocr-extract')) {
          return Promise.resolve({ ok: true, json: async () => ({ bankReference: null }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
      renderPage();
      const user = userEvent.setup();

      await user.click(await screen.findByRole('button', { name: /record a transaction/i }));
      await user.selectOptions(screen.getByLabelText(/payment method/i), 'UPI');

      const file = new File(['fake-bytes'], 'bill.png', { type: 'image/png' });
      await user.upload(screen.getByLabelText(/attach a bill, invoice, or receipt/i, { selector: 'input' }), file);
      await user.click(screen.getByRole('button', { name: /infer from proof/i }));

      await waitFor(() => expect(screen.getByText(/no reference detected/i)).toBeInTheDocument());
      expect(screen.getByPlaceholderText(/utr \/ cheque number/i)).toHaveValue('');
    });
  });

  describe('list search & sort', () => {
    const entries = [
      {
        id: 'e1',
        direction: 'EXPENSE',
        amount: '500.00',
        transactionDate: '2026-01-05',
        paymentMethod: 'CASH',
        bankReference: null,
        note: null,
        fileUrl: null,
        category: { id: 'c1', name: 'Electricity', direction: 'EXPENSE' },
        recordedBy: { id: 'u1', name: 'Admin One' },
      },
      {
        id: 'e2',
        direction: 'INCOME',
        amount: '2000.00',
        transactionDate: '2026-01-10',
        paymentMethod: 'BANK_TRANSFER',
        bankReference: 'UTR123',
        note: null,
        fileUrl: null,
        category: { id: 'c2', name: 'Bank Interest', direction: 'INCOME' },
        recordedBy: { id: 'u1', name: 'Admin One' },
      },
      {
        id: 'e3',
        direction: 'EXPENSE',
        amount: '150.00',
        transactionDate: '2026-01-15',
        paymentMethod: 'CASH',
        bankReference: null,
        note: 'Plumbing repair',
        fileUrl: null,
        category: { id: 'c3', name: 'Plumbing', direction: 'EXPENSE' },
        recordedBy: { id: 'u1', name: 'Admin One' },
      },
    ];

    function mockFetchWithEntries() {
      const fetchMock = fetch as unknown as FetchMock;
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/admin/society-ledger')) {
          return Promise.resolve({ ok: true, json: async () => entries });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });
    }

    it('filters the list to rows matching the search box', async () => {
      mockFetchWithEntries();
      renderPage();
      const user = userEvent.setup();

      await screen.findByText('Electricity');
      expect(screen.getByText('Bank Interest')).toBeInTheDocument();
      expect(screen.getByText('Plumbing')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/search/i), 'plumbing');

      expect(screen.getByText('Plumbing')).toBeInTheDocument();
      expect(screen.queryByText('Electricity')).not.toBeInTheDocument();
      expect(screen.queryByText('Bank Interest')).not.toBeInTheDocument();
    });

    it('shows a clear-search icon only once there is search text, and clears just the search box', async () => {
      mockFetchWithEntries();
      renderPage();
      const user = userEvent.setup();

      await screen.findByText('Electricity');
      expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();

      await user.type(screen.getByLabelText(/search/i), 'plumbing');
      expect(screen.queryByText('Electricity')).not.toBeInTheDocument();

      const clearSearchButton = screen.getByRole('button', { name: /clear search/i });
      await user.click(clearSearchButton);

      expect(screen.getByLabelText(/search/i)).toHaveValue('');
      expect(screen.getByText('Electricity')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /clear search/i })).not.toBeInTheDocument();
    });

    it('sorts the list by amount when the Amount column header is clicked, toggling direction', async () => {
      mockFetchWithEntries();
      renderPage();
      const user = userEvent.setup();

      await screen.findByText('Electricity');
      const amountHeader = screen.getByRole('button', { name: /amount/i });

      function rowTexts() {
        return Array.from(document.querySelectorAll('tbody tr')).map((tr) => tr.textContent);
      }

      await user.click(amountHeader);
      await waitFor(() => {
        const texts = rowTexts();
        expect(texts[0]).toContain('Bank Interest');
        expect(texts[1]).toContain('Electricity');
        expect(texts[2]).toContain('Plumbing');
      });

      await user.click(amountHeader);
      await waitFor(() => {
        const texts = rowTexts();
        expect(texts[0]).toContain('Plumbing');
        expect(texts[1]).toContain('Electricity');
        expect(texts[2]).toContain('Bank Interest');
      });
    });

    it('no longer shows a Recorded by column', async () => {
      mockFetchWithEntries();
      renderPage();

      await screen.findByText('Electricity');
      expect(screen.queryByText(/recorded by/i)).not.toBeInTheDocument();
      expect(screen.queryByText('Admin One')).not.toBeInTheDocument();
    });

    it('filters via separate Year and Month dropdowns', async () => {
      const febEntry = {
        ...entries[0],
        id: 'e4',
        category: { id: 'c4', name: 'February Only Category', direction: 'EXPENSE' },
        transactionDate: '2026-02-10',
      };
      const pastYearEntry = {
        ...entries[0],
        id: 'e5',
        category: { id: 'c5', name: 'PastYear Only Category', direction: 'EXPENSE' },
        transactionDate: '2025-01-05',
      };
      const fetchMock = fetch as unknown as FetchMock;
      fetchMock.mockImplementation((url: string) => {
        if (url.includes('/api/admin/society-ledger')) {
          return Promise.resolve({ ok: true, json: async () => [...entries, febEntry, pastYearEntry] });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      renderPage();
      const user = userEvent.setup();

      await screen.findByText('February Only Category');
      expect(screen.getByText('Electricity')).toBeInTheDocument();
      expect(screen.getByText('PastYear Only Category')).toBeInTheDocument();

      // Year alone narrows to that year, across all its months.
      await user.selectOptions(screen.getByLabelText(/year/i), '2025');
      expect(screen.getByText('PastYear Only Category')).toBeInTheDocument();
      expect(screen.queryByText('Electricity')).not.toBeInTheDocument();
      expect(screen.queryByText('February Only Category')).not.toBeInTheDocument();

      // Year + Month together narrow to a single month.
      await user.selectOptions(screen.getByLabelText(/year/i), '2026');
      await user.selectOptions(screen.getByLabelText(/month/i), '02');
      expect(screen.getByText('February Only Category')).toBeInTheDocument();
      expect(screen.queryByText('Electricity')).not.toBeInTheDocument();
      expect(screen.queryByText('Bank Interest')).not.toBeInTheDocument();
      expect(screen.queryByText('Plumbing')).not.toBeInTheDocument();
      expect(screen.queryByText('PastYear Only Category')).not.toBeInTheDocument();
    });
  });
});
