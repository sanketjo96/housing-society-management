import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../../lib/auth-token';
import { SocietyDetailsPage } from './SocietyDetailsPage';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SocietyDetailsPage />
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

const baseSettings = {
  name: 'Sunrise Residency',
  address: '1 Garden Road, Pune',
  upiVpa: 'sunrise-residency@okhdfcbank',
  bankAccountNumber: null,
  bankIfsc: null,
  tenantRateFactor: 1.5,
  defaultBaseRate: 1500,
  receiptNumberPrefix: 'RCPT',
  receiptSignatoryName: null,
  receiptSignatoryTitle: null,
  receiptFooterNote: null,
  hasSignature: false,
};

describe('SocietyDetailsPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('loads and displays the current society details', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
    expect(screen.getByDisplayValue('1 Garden Road, Pune')).toBeInTheDocument();
    expect(screen.getByDisplayValue('sunrise-residency@okhdfcbank')).toBeInTheDocument();
    // The save button starts disabled — nothing has been changed yet.
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('submits updated values and shows confirmation', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let sentBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/settings') && init?.method === 'PATCH') {
        sentBody = init.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ ...baseSettings, name: 'Renamed Society' }) });
      }
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/society name/i));
    await user.type(screen.getByLabelText(/society name/i), 'Renamed Society');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
    expect(JSON.parse(sentBody!)).toEqual({
      name: 'Renamed Society',
      address: baseSettings.address,
      upiVpa: baseSettings.upiVpa,
      bankAccountNumber: '',
      bankIfsc: '',
    });
  });

  it('updates the UPI ID', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let sentBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/settings') && init?.method === 'PATCH') {
        sentBody = init.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ ...baseSettings, upiVpa: 'new-vpa@okaxis' }) });
      }
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('sunrise-residency@okhdfcbank')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/upi id/i));
    await user.type(screen.getByLabelText(/upi id/i), 'new-vpa@okaxis');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
    expect(JSON.parse(sentBody!).upiVpa).toBe('new-vpa@okaxis');
  });

  it('rejects an empty society name client-side', async () => {
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

    await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/society name/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/society name is required/i)).toBeInTheDocument();
    });
  });

  it('saves a complete bank account number + IFSC pair', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let sentBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/settings') && init?.method === 'PATCH') {
        sentBody = init.body as string;
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...baseSettings, bankAccountNumber: '123456789012', bankIfsc: 'HDFC0001234' }),
        });
      }
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/bank account number/i), '123456789012');
    await user.type(screen.getByLabelText(/ifsc code/i), 'HDFC0001234');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
    const parsed = JSON.parse(sentBody!);
    expect(parsed.bankAccountNumber).toBe('123456789012');
    expect(parsed.bankIfsc).toBe('HDFC0001234');
  });

  it('rejects an account number entered without a matching IFSC', async () => {
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

    await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/bank account number/i), '123456789012');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter both account number and ifsc together/i)).toBeInTheDocument();
    });
  });

  it('rejects a malformed IFSC code client-side', async () => {
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

    await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
    await user.type(screen.getByLabelText(/bank account number/i), '123456789012');
    await user.type(screen.getByLabelText(/ifsc code/i), 'not-an-ifsc');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/enter a valid 11-character ifsc code/i)).toBeInTheDocument();
    });
  });
});
