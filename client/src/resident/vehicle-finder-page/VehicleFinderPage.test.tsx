import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VehicleFinderPage } from './VehicleFinderPage';

type FetchMock = ReturnType<typeof vi.fn>;

// Minimal stand-in for the browser's webkitSpeechRecognition/SpeechRecognition
// constructor — jsdom doesn't implement the Web Speech API.
class FakeSpeechRecognition {
  static current: FakeSpeechRecognition | null = null;
  lang = '';
  interimResults = false;
  onresult: ((event: { results: { transcript: string }[][] }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() {
    FakeSpeechRecognition.current = this;
  }
  stop() {}
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <VehicleFinderPage />
    </QueryClientProvider>,
  );
}

describe('VehicleFinderPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the matching flat, occupant name, and phone on a hit', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        found: true,
        wing: 'A',
        flatNumber: '101',
        occupantName: 'Alice Owner',
        occupantPhone: '9999999999',
      }),
    });

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/plate number/i), 'MH12AB1234');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => expect(screen.getByText(/flat a-101/i)).toBeInTheDocument());
    expect(screen.getByText('Alice Owner')).toBeInTheDocument();
    // Tappable on mobile — initiates a call directly rather than just displaying
    // the number.
    expect(screen.getByRole('link', { name: /9999999999/ })).toHaveAttribute('href', 'tel:9999999999');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/vehicles/search?plate='),
      expect.anything(),
    );
  });

  it('shows a not-found message on a miss', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ found: false }) });

    renderPage();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/plate number/i), 'ZZ00ZZ0000');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    await waitFor(() => expect(screen.getByText(/no vehicle found/i)).toBeInTheDocument());
  });

  it('fills the plate field and searches automatically from a voice result', async () => {
    const fetchMock = fetch as unknown as FetchMock;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        found: true,
        wing: 'A',
        flatNumber: '101',
        occupantName: 'Alice Owner',
        occupantPhone: null,
      }),
    });
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognition);

    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /search by voice/i }));
    act(() => {
      FakeSpeechRecognition.current!.onresult!({ results: [[{ transcript: 'mh 12 ab 1234' }]] });
    });

    expect(screen.getByLabelText(/plate number/i)).toHaveValue('MH12AB1234');
    await waitFor(() => expect(screen.getByText(/flat a-101/i)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('plate=MH12AB1234'), expect.anything());
  });

  it('hides the voice-search button when the browser has no Web Speech API', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /search by voice/i })).not.toBeInTheDocument();
  });

  it('shows the reason when voice recognition fails, e.g. denied mic permission', async () => {
    vi.stubGlobal('webkitSpeechRecognition', FakeSpeechRecognition);
    renderPage();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /search by voice/i }));
    act(() => {
      FakeSpeechRecognition.current!.onerror!({ error: 'not-allowed' });
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/microphone access/i);
    // The button should be usable again, not stuck in "Listening…".
    expect(screen.getByRole('button', { name: /search by voice/i })).toBeInTheDocument();
  });
});
