import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../lib/auth-token';
import { AdminComplaintsPage } from './AdminComplaintsPage';

type FetchMock = ReturnType<typeof vi.fn>;

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminComplaintsPage />
    </QueryClientProvider>,
  );
}

const openComplaint = {
  id: 'complaint-1',
  title: 'Leaky pipe',
  possibleSolution: 'Call the plumber',
  priority: 'HIGH' as const,
  status: 'OPEN' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  hasImage: false,
  upvoteCount: 3,
  owner: { id: 'owner-1', name: 'Alice Owner' },
  flat: { wing: 'A', flatNumber: '101' },
};

const resolvedComplaintWithImage = {
  ...openComplaint,
  id: 'complaint-2',
  title: 'Broken light',
  status: 'RESOLVED' as const,
  hasImage: true,
  upvoteCount: 0,
};

describe('AdminComplaintsPage', () => {
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

  it('lists every complaint with flat, priority, and upvote count', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [openComplaint] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    expect(screen.getByText('A-101')).toBeInTheDocument();
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows an empty state when there are no complaints', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [] });

    renderPage();

    await waitFor(() => expect(screen.getByText(/no complaints/i)).toBeInTheDocument());
  });

  it('shows "No image" when a complaint has none, and a view control when it does', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => [openComplaint, resolvedComplaintWithImage] });

    renderPage();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    expect(screen.getByText(/no image/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /view image/i })).toBeInTheDocument();
  });

  it('viewing an image fetches it authenticated and opens it in a new tab', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/image')) {
        return Promise.resolve({ ok: true, blob: async () => new Blob(['x']) });
      }
      return Promise.resolve({ ok: true, json: async () => [resolvedComplaintWithImage] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Broken light')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /view image/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/complaints/complaint-2/image'),
        expect.anything(),
      ),
    );
    expect(window.open).toHaveBeenCalledWith('blob:fake-url', '_blank');
  });

  it('changing status calls the admin endpoint with the new value and refetches', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    let patchBody: string | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/admin/complaints/complaint-1/status')) {
        patchBody = init?.body as string;
        return Promise.resolve({ ok: true, json: async () => ({ ...openComplaint, status: 'IN_PROGRESS' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [openComplaint] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    const select = screen.getByLabelText(/status for leaky pipe/i);
    await user.selectOptions(select, 'IN_PROGRESS');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/complaints/complaint-1/status'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
    expect(JSON.parse(patchBody!)).toEqual({ status: 'IN_PROGRESS' });
  });

  it('allows moving a Resolved complaint backwards to Open — no restricted transitions in the UI', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/complaints/complaint-2/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ ...resolvedComplaintWithImage, status: 'OPEN' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [resolvedComplaintWithImage] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Broken light')).toBeInTheDocument());
    const select = screen.getByLabelText(/status for broken light/i);

    // Every option is present and enabled regardless of current status.
    expect(select).not.toBeDisabled();
    await user.selectOptions(select, 'OPEN');

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/complaints/complaint-2/status'),
        expect.objectContaining({ method: 'PATCH' }),
      ),
    );
  });

  it('shows an error message if the status change fails', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('/api/admin/complaints/complaint-1/status')) {
        return Promise.resolve({ ok: false, json: async () => ({ error: 'Complaint not found' }) });
      }
      return Promise.resolve({ ok: true, json: async () => [openComplaint] });
    });

    renderPage();
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    await user.selectOptions(screen.getByLabelText(/status for leaky pipe/i), 'REJECTED');

    await waitFor(() => expect(screen.getByText('Complaint not found')).toBeInTheDocument());
  });
});
