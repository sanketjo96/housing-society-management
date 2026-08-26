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
});
