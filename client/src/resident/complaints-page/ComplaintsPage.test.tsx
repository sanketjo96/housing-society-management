import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../context/AuthContext';
import { ComplaintsPage } from './ComplaintsPage';
import type { ComplaintListItem } from './types';

type FetchMock = ReturnType<typeof vi.fn>;

const ownerUser = {
  id: 'owner-1',
  name: 'Alice Owner',
  email: 'alice@example.com',
  phone: null,
  role: 'OWNER' as const,
  societyId: 's1',
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ComplaintsPage />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const myOpenComplaint: ComplaintListItem = {
  id: 'c-1',
  title: 'Leaky pipe',
  possibleSolution: 'Call the plumber',
  priority: 'HIGH',
  status: 'OPEN',
  createdAt: '2026-08-29T00:00:00.000Z',
  updatedAt: '2026-08-29T00:00:00.000Z',
  hasImage: false,
  upvoteCount: 0,
  myUpvoted: false,
  owner: { id: 'owner-1', name: 'Alice Owner' },
  flat: { wing: 'A', flatNumber: '101' },
};

// Mutable list so create/upvote/delete mutations can observably change what
// the next GET returns, same pattern as MyDetailsPage.test.tsx's vehicles mock.
// Copies each item (not just the array) so mutating a row here — e.g. the
// upvote handler below flipping myUpvoted/upvoteCount in place — never
// leaks back into a shared module-level fixture like `myOpenComplaint` and
// pollutes a later test.
function mockAuthAndComplaints(initial: ComplaintListItem[] = []) {
  const complaints = initial.map((c) => ({ ...c }));
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/refresh')) {
      return Promise.resolve({ ok: true, json: async () => ({ accessToken: 'fake-token' }) });
    }
    if (url.includes('/api/auth/me')) {
      return Promise.resolve({ ok: true, json: async () => ownerUser });
    }

    const upvoteMatch = url.match(/\/api\/complaints\/([^/]+)\/upvote$/);
    if (upvoteMatch) {
      const complaint = complaints.find((c) => c.id === upvoteMatch[1]);
      if (complaint) {
        const nowUpvoted = init?.method === 'POST';
        if (complaint.myUpvoted !== nowUpvoted) {
          complaint.myUpvoted = nowUpvoted;
          complaint.upvoteCount += nowUpvoted ? 1 : -1;
        }
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }

    const itemMatch = url.match(/\/api\/complaints\/([^/]+)$/);
    if (itemMatch && init?.method === 'PATCH') {
      return Promise.resolve({ ok: false, status: 409, json: async () => ({ error: 'Locked' }) });
    }
    if (itemMatch && init?.method === 'DELETE') {
      const idx = complaints.findIndex((c) => c.id === itemMatch[1]);
      if (idx >= 0) complaints.splice(idx, 1);
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }

    if (url.includes('/api/complaints') && (init?.method ?? 'GET') === 'POST') {
      const created: ComplaintListItem = {
        id: `c-${complaints.length + 1}`,
        title: 'New complaint',
        possibleSolution: 'Fix it',
        priority: 'LOW',
        status: 'OPEN',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        hasImage: false,
        upvoteCount: 0,
        myUpvoted: false,
        owner: ownerUser,
        flat: { wing: 'A', flatNumber: '101' },
      };
      complaints.push(created);
      return Promise.resolve({ ok: true, json: async () => created });
    }

    if (url.includes('/api/complaints')) {
      return Promise.resolve({ ok: true, json: async () => [...complaints] });
    }

    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  return complaints;
}

describe('ComplaintsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists complaints with title, flat, priority, and status', async () => {
    mockAuthAndComplaints([myOpenComplaint]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    expect(screen.getByText('A-101')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('logs a new complaint and shows it in the list', async () => {
    mockAuthAndComplaints([]);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: /log a complaint/i }));
    await user.type(screen.getByLabelText(/title/i), 'New complaint');
    await user.type(screen.getByLabelText(/possible solution/i), 'Fix it');
    await user.click(screen.getByRole('button', { name: /^log complaint$/i }));

    await waitFor(() => expect(screen.getByText('New complaint')).toBeInTheDocument());
  });

  it('toggles an upvote', async () => {
    mockAuthAndComplaints([myOpenComplaint]);
    renderPage();
    const user = userEvent.setup();

    const upvoteButton = await screen.findByRole('button', { name: /upvote leaky pipe/i });
    await user.click(upvoteButton);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /remove upvote from leaky pipe/i })).toBeInTheDocument(),
    );
  });

  it('shows edit/delete controls for my own Open, zero-upvote complaint', async () => {
    mockAuthAndComplaints([myOpenComplaint]);
    renderPage();

    await waitFor(() => expect(screen.getByLabelText(/edit leaky pipe/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/delete leaky pipe/i)).toBeInTheDocument();
  });

  it('hides edit/delete controls once the complaint has an upvote', async () => {
    mockAuthAndComplaints([{ ...myOpenComplaint, upvoteCount: 1 }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    expect(screen.queryByLabelText(/edit leaky pipe/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/delete leaky pipe/i)).not.toBeInTheDocument();
  });

  it('hides edit/delete controls once status moves off Open', async () => {
    mockAuthAndComplaints([{ ...myOpenComplaint, status: 'IN_PROGRESS' }]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    expect(screen.queryByLabelText(/edit leaky pipe/i)).not.toBeInTheDocument();
  });

  it("does not show another owner's complaint at all — this page is my own complaints only", async () => {
    mockAuthAndComplaints([
      myOpenComplaint,
      { ...myOpenComplaint, id: 'c-someone-else', title: 'Someone else\'s issue', owner: { id: 'someone-else', name: 'Bob' } },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Leaky pipe')).toBeInTheDocument());
    expect(screen.queryByText('Someone else\'s issue')).not.toBeInTheDocument();
  });

  it('shows an error, not a crash, when editing a since-locked complaint returns 409', async () => {
    mockAuthAndComplaints([myOpenComplaint]);
    renderPage();
    const user = userEvent.setup();

    await user.click(await screen.findByLabelText(/edit leaky pipe/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(screen.getByText(/this complaint is no longer editable/i)).toBeInTheDocument(),
    );
  });
});
