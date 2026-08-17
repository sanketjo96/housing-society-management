import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../../lib/auth-token';
import { ReceiptTemplatePage } from './ReceiptTemplatePage';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <ReceiptTemplatePage />
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

const baseSettings = {
  name: 'Sunrise Residency',
  address: '1 Garden Road, Pune',
  upiVpa: 'sunrise-residency@okhdfcbank',
  tenantRateFactor: 1.5,
  defaultBaseRate: 1500,
  receiptNumberPrefix: 'RCPT',
  receiptSignatoryName: null,
  receiptSignatoryTitle: null,
  receiptFooterNote: null,
};

describe('ReceiptTemplatePage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('loads and displays the current receipt template', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByDisplayValue('RCPT')).toBeInTheDocument());
    // The save button starts disabled — nothing has been changed yet.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('rejects an invalid receipt number prefix client-side', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/settings') && init?.method === 'PATCH') {
        return Promise.reject(new Error('PATCH should not have been called'));
      }
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('RCPT')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/receipt number prefix/i));
    await user.type(screen.getByLabelText(/receipt number prefix/i), 'has a space');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/letters, digits, or hyphens/i)).toBeInTheDocument();
    });
  });

  it('updates the signatory name/title and footer note', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let sentBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/settings') && init?.method === 'PATCH') {
        sentBody = init.body as string;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...baseSettings,
            receiptSignatoryName: 'Ramesh Kulkarni',
            receiptSignatoryTitle: 'Treasurer',
            receiptFooterNote: 'Thank you.',
          }),
        });
      }
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('RCPT')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/signatory name/i), 'Ramesh Kulkarni');
    await user.type(screen.getByLabelText(/signatory title/i), 'Treasurer');
    await user.type(screen.getByLabelText(/footer note/i), 'Thank you.');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
    const parsed = JSON.parse(sentBody!);
    expect(parsed.receiptSignatoryName).toBe('Ramesh Kulkarni');
    expect(parsed.receiptSignatoryTitle).toBe('Treasurer');
    expect(parsed.receiptFooterNote).toBe('Thank you.');
  });

  it('points to the Committee tab instead of showing its own signature upload', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByText(/managed from/i)).toBeInTheDocument());
    expect(screen.getByText(/society details/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove signature/i })).not.toBeInTheDocument();
  });
});
