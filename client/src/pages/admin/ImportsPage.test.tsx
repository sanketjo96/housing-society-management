import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { ImportsPage } from './ImportsPage';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportsPage />
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

describe('ImportsPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('uploads a CSV file and shows per-row results', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let sentBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/flats/import')) {
        sentBody = init?.body as string;
        return Promise.resolve({
          ok: true,
          json: async () => ({ created: [{ id: 'x' }], errors: [{ row: 3, message: 'Missing required value(s)' }] }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /flats, owners & tenants/i })).toBeInTheDocument(),
    );

    const csvText = 'wing,flatNumber,ownerName,ownerPhone,ownerEmail\nA,101,Test Owner,9876543210,test-owner@example.com';
    const file = new File([csvText], 'flats.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText(/upload csv file/i), file);

    await waitFor(() => {
      expect(screen.getByText(/1 flat\(s\) created/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/missing required value/i)).toBeInTheDocument();
    expect(JSON.parse(sentBody!).csv).toBe(csvText);
  });

  it('has a template download button, distinct from the upload button', async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /flats, owners & tenants/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import csv/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
