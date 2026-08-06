import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { SettingsPage } from './SettingsPage';

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsPage />
    </QueryClientProvider>,
  );
}

type FetchMock = ReturnType<typeof vi.fn>;

const baseSettings = {
  name: 'Sunrise Residency',
  upiVpa: 'sunrise-residency@okhdfcbank',
  tenantRateFactor: 1.5,
  defaultBaseRate: 1500,
};

describe('SettingsPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('loads and displays the current settings', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();

    await waitFor(() => expect(screen.getByDisplayValue('1500')).toBeInTheDocument());
    expect(screen.getByDisplayValue('1.5')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument();
    expect(screen.getByDisplayValue('sunrise-residency@okhdfcbank')).toBeInTheDocument();
    // The save button starts disabled — nothing has been changed yet.
    expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
  });

  it('submits updated values and shows confirmation', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let sentBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/settings') && init?.method === 'PATCH') {
        sentBody = init.body as string;
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...baseSettings, tenantRateFactor: 2, defaultBaseRate: 1800, name: 'Renamed Society' }),
        });
      }
      if (url.includes('/api/admin/settings')) {
        return Promise.resolve({ ok: true, json: async () => baseSettings });
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByDisplayValue('1500')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/society name/i));
    await user.type(screen.getByLabelText(/society name/i), 'Renamed Society');
    await user.clear(screen.getByLabelText(/default base rate/i));
    await user.type(screen.getByLabelText(/default base rate/i), '1800');
    await user.clear(screen.getByLabelText(/tenant occupancy factor/i));
    await user.type(screen.getByLabelText(/tenant occupancy factor/i), '2');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
    expect(JSON.parse(sentBody!)).toEqual({
      name: 'Renamed Society',
      upiVpa: baseSettings.upiVpa,
      defaultBaseRate: 1800,
      tenantRateFactor: 2,
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
    await user.click(screen.getByRole('button', { name: /save settings/i }));

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

    await waitFor(() => expect(screen.getByDisplayValue('1500')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/society name/i));
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/society name is required/i)).toBeInTheDocument();
    });
  });

  it('rejects a non-positive occupancy factor client-side', async () => {
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

    await waitFor(() => expect(screen.getByDisplayValue('1500')).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/tenant occupancy factor/i));
    await user.type(screen.getByLabelText(/tenant occupancy factor/i), '-1');
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => {
      expect(screen.getByText(/occupancy factor must be a positive number/i)).toBeInTheDocument();
    });
  });
});
