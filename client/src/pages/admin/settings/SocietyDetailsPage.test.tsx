import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setAccessToken } from '../../../lib/auth-token';
import type { SocietySettings } from './settings-api';
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

const baseSettings: SocietySettings = {
  name: 'Sunrise Residency',
  address: '1 Garden Road, Pune',
  constructionDate: '1998-04-12',
  formationDate: '1999-01-20',
  upiVpa: 'sunrise-residency@okhdfcbank',
  bankAccountNumber: null,
  bankIfsc: null,
  tenantRateFactor: 1.5,
  defaultBaseRate: 1500,
  receiptNumberPrefix: 'RCPT',
  receiptSignatoryName: null,
  receiptSignatoryTitle: null,
  receiptFooterNote: null,
  hasChairmanSignature: false,
  hasSecretarySignature: false,
  hasTreasurerSignature: false,
  chairman: null,
  secretary: null,
  treasurer: null,
};

const owners = [
  { id: 'owner-1', name: 'Alice Owner', email: 'alice@example.com', phone: null },
  { id: 'owner-2', name: 'Bob Owner', email: 'bob@example.com', phone: null },
];

function mockFetch(
  overrides: {
    settings?: typeof baseSettings;
    onPatch?: (body: string) => unknown;
    onSignaturePost?: (role: string) => unknown;
    onSignatureDelete?: (role: string) => unknown;
  } = {},
) {
  const fetchMock = fetch as unknown as FetchMock;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    const signatureMatch = url.match(/\/api\/admin\/settings\/committee\/([a-z]+)\/signature/);
    if (signatureMatch && init?.method === 'POST') {
      const response = overrides.onSignaturePost?.(signatureMatch[1]) ?? { ...baseSettings };
      return Promise.resolve({ ok: true, json: async () => response });
    }
    if (signatureMatch && init?.method === 'DELETE') {
      const response = overrides.onSignatureDelete?.(signatureMatch[1]) ?? { ...baseSettings };
      return Promise.resolve({ ok: true, json: async () => response });
    }
    if (signatureMatch) {
      return Promise.resolve({ ok: true, blob: async () => new Blob(['fake-png']) });
    }
    if (url.includes('/api/admin/settings') && init?.method === 'PATCH') {
      const body = init.body as string;
      const response = overrides.onPatch ? overrides.onPatch(body) : { ...baseSettings };
      return Promise.resolve({ ok: true, json: async () => response });
    }
    if (url.includes('/api/admin/settings')) {
      return Promise.resolve({ ok: true, json: async () => overrides.settings ?? baseSettings });
    }
    if (url.includes('/api/admin/flats')) {
      return Promise.resolve({ ok: true, json: async () => owners.map((owner) => ({ owner })) });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe('SocietyDetailsPage', () => {
  beforeEach(() => {
    setAccessToken('fake-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it('shows three tabs: Basic information, Committee, and Payment', async () => {
    mockFetch();
    renderPage();

    await waitFor(() => expect(screen.getByRole('tab', { name: /basic information/i })).toBeInTheDocument());
    expect(screen.getByRole('tab', { name: /committee/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /payment/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /basic information/i })).toHaveAttribute('aria-selected', 'true');
  });

  describe('Basic information tab', () => {
    it('loads and displays the current society name, address, and dates', async () => {
      mockFetch();
      renderPage();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      expect(screen.getByDisplayValue('1 Garden Road, Pune')).toBeInTheDocument();
      expect(screen.getByLabelText(/construction date/i)).toHaveValue('1998-04-12');
      expect(screen.getByLabelText(/society formation date/i)).toHaveValue('1999-01-20');
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    });

    it('submits name, address, and both dates — not payment or committee fields', async () => {
      let sentBody: string | undefined;
      mockFetch({
        onPatch: (body) => {
          sentBody = body;
          return { ...baseSettings, name: 'Renamed Society' };
        },
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
        constructionDate: baseSettings.constructionDate,
        formationDate: baseSettings.formationDate,
      });
    });

    it('rejects an empty society name client-side', async () => {
      mockFetch({
        onPatch: () => {
          throw new Error('PATCH should not have been called');
        },
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

    it('blocks saving a pre-existing society until both dates are filled in', async () => {
      mockFetch({
        settings: { ...baseSettings, constructionDate: null, formationDate: null },
        onPatch: () => {
          throw new Error('PATCH should not have been called');
        },
      });
      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      expect(screen.getByLabelText(/construction date/i)).toHaveValue('');
      // The save button starts disabled (nothing dirty yet) — touch an unrelated
      // field so there's something to submit, then let required-field validation
      // catch the still-blank dates.
      await user.type(screen.getByLabelText(/society name/i), '!');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/construction date is required/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/society formation date is required/i)).toBeInTheDocument();
    });
  });

  describe('Committee tab', () => {
    it('shows a dropdown of the society\'s owners for each role, nothing to type', async () => {
      mockFetch();
      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /committee/i }));

      await waitFor(() => expect(screen.getByLabelText('Chairman')).toBeInTheDocument());
      expect(screen.getByLabelText('Secretary')).toBeInTheDocument();
      expect(screen.getByLabelText('Treasurer')).toBeInTheDocument();
      // Every field is a <select>, not a text input — nothing to type.
      expect(screen.getByLabelText('Chairman').tagName).toBe('SELECT');
      const chairmanSelect = screen.getByLabelText('Chairman') as HTMLSelectElement;
      expect(within(chairmanSelect).getByRole('option', { name: /alice owner/i })).toBeInTheDocument();
      expect(within(chairmanSelect).getByRole('option', { name: /bob owner/i })).toBeInTheDocument();
    });

    it('pre-fills already-assigned committee roles', async () => {
      mockFetch({ settings: { ...baseSettings, chairman: owners[0], treasurer: owners[1] } });
      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /committee/i }));

      await waitFor(() => expect(screen.getByLabelText('Chairman')).toHaveValue('owner-1'));
      expect(screen.getByLabelText('Secretary')).toHaveValue('');
      expect(screen.getByLabelText('Treasurer')).toHaveValue('owner-2');
    });

    it('submits all three committee fields once every role is picked', async () => {
      let sentBody: string | undefined;
      mockFetch({
        onPatch: (body) => {
          sentBody = body;
          return { ...baseSettings, chairman: owners[0], secretary: owners[1], treasurer: owners[0] };
        },
      });
      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /committee/i }));
      await waitFor(() => expect(screen.getByLabelText('Chairman')).toBeInTheDocument());

      await user.selectOptions(screen.getByLabelText('Chairman'), 'owner-1');
      await user.selectOptions(screen.getByLabelText('Secretary'), 'owner-2');
      await user.selectOptions(screen.getByLabelText('Treasurer'), 'owner-1');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
      expect(JSON.parse(sentBody!)).toEqual({ chairmanId: 'owner-1', secretaryId: 'owner-2', treasurerId: 'owner-1' });
    });

    it('blocks saving until all three roles are picked', async () => {
      mockFetch({
        onPatch: () => {
          throw new Error('PATCH should not have been called');
        },
      });
      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /committee/i }));
      await waitFor(() => expect(screen.getByLabelText('Chairman')).toBeInTheDocument());

      await user.selectOptions(screen.getByLabelText('Chairman'), 'owner-1');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/secretary is required/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/treasurer is required/i)).toBeInTheDocument();
    });

    describe('signature widget', () => {
      it('shows "No signature yet" for an assigned role with no signature, and no widget for an unassigned one', async () => {
        mockFetch({ settings: { ...baseSettings, chairman: owners[0], hasChairmanSignature: false } });
        renderPage();
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
        await user.click(screen.getByRole('tab', { name: /committee/i }));

        await waitFor(() => expect(screen.getByText(/no signature yet — required/i)).toBeInTheDocument());
        // Secretary/treasurer are unassigned — no signature widget renders for them.
        expect(screen.getAllByText(/no signature yet — required/i)).toHaveLength(1);
        // No signature set at all — upload/draw show by default, no Remove button.
        expect(screen.getByRole('button', { name: /^upload$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^draw$/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /remove signature/i })).not.toBeInTheDocument();
      });

      it("hides the widget and shows a save-first note when a role's selection changes", async () => {
        mockFetch({ settings: { ...baseSettings, chairman: owners[0], hasChairmanSignature: true } });
        renderPage();
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
        await user.click(screen.getByRole('tab', { name: /committee/i }));
        await waitFor(() => expect(screen.getByLabelText('Chairman')).toHaveValue('owner-1'));

        await user.selectOptions(screen.getByLabelText('Chairman'), 'owner-2');

        await waitFor(() => {
          expect(screen.getByText(/save the chairman change above before adding a signature/i)).toBeInTheDocument();
        });
      });

      it('uploads a signature via the per-role endpoint and shows a Remove button', async () => {
        mockFetch({
          settings: { ...baseSettings, chairman: owners[0], hasChairmanSignature: false },
          onSignaturePost: () => ({ ...baseSettings, chairman: owners[0], hasChairmanSignature: true }),
        });
        renderPage();
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
        await user.click(screen.getByRole('tab', { name: /committee/i }));

        await waitFor(() => expect(screen.getByText(/upload chairman signature image/i)).toBeInTheDocument());
        const fileInput = screen.getByLabelText(/upload chairman signature image/i, { selector: 'input' });
        const file = new File(['fake-png'], 'sig.png', { type: 'image/png' });
        await user.upload(fileInput, file);

        await waitFor(() => expect(screen.getByRole('button', { name: /remove signature/i })).toBeInTheDocument());
        // Signature is now set — upload/draw controls hide, only Remove is shown.
        expect(screen.queryByRole('button', { name: /^upload$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^draw$/i })).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/upload chairman signature image/i, { selector: 'input' })).not.toBeInTheDocument();
      });

      it('removes an existing signature via the per-role endpoint', async () => {
        mockFetch({
          settings: { ...baseSettings, chairman: owners[0], hasChairmanSignature: true },
          onSignatureDelete: () => ({ ...baseSettings, chairman: owners[0], hasChairmanSignature: false }),
        });
        renderPage();
        const user = userEvent.setup();

        await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
        await user.click(screen.getByRole('tab', { name: /committee/i }));

        const removeButton = await screen.findByRole('button', { name: /remove signature/i });
        // Signature is already set — upload/draw stay hidden while only Remove shows.
        expect(screen.queryByRole('button', { name: /^upload$/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /^draw$/i })).not.toBeInTheDocument();

        await user.click(removeButton);

        // Only once removal actually completes do upload/draw reappear.
        await waitFor(() => expect(screen.getByText(/no signature yet — required/i)).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /^upload$/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /^draw$/i })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /remove signature/i })).not.toBeInTheDocument();
      });
    });
  });

  describe('Payment tab', () => {
    it('shows the current UPI ID', async () => {
      mockFetch();
      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /payment/i }));

      await waitFor(() => expect(screen.getByDisplayValue('sunrise-residency@okhdfcbank')).toBeInTheDocument());
    });

    it('updates the UPI ID, sending only payment fields', async () => {
      let sentBody: string | undefined;
      mockFetch({
        onPatch: (body) => {
          sentBody = body;
          return { ...baseSettings, upiVpa: 'new-vpa@okaxis' };
        },
      });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /payment/i }));
      await waitFor(() => expect(screen.getByDisplayValue('sunrise-residency@okhdfcbank')).toBeInTheDocument());

      await user.clear(screen.getByLabelText(/upi id/i));
      await user.type(screen.getByLabelText(/upi id/i), 'new-vpa@okaxis');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
      expect(JSON.parse(sentBody!)).toEqual({
        upiVpa: 'new-vpa@okaxis',
        bankAccountNumber: '',
        bankIfsc: '',
      });
    });

    it('saves a complete bank account number + IFSC pair', async () => {
      let sentBody: string | undefined;
      mockFetch({
        onPatch: (body) => {
          sentBody = body;
          return { ...baseSettings, bankAccountNumber: '123456789012', bankIfsc: 'HDFC0001234' };
        },
      });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /payment/i }));
      await waitFor(() => expect(screen.getByLabelText(/bank account number/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/bank account number/i), '123456789012');
      await user.type(screen.getByLabelText(/ifsc code/i), 'HDFC0001234');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => expect(screen.getByText(/^saved\.$/i)).toBeInTheDocument());
      const parsed = JSON.parse(sentBody!);
      expect(parsed.bankAccountNumber).toBe('123456789012');
      expect(parsed.bankIfsc).toBe('HDFC0001234');
    });

    it('rejects an account number entered without a matching IFSC', async () => {
      mockFetch({
        onPatch: () => {
          throw new Error('PATCH should not have been called');
        },
      });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /payment/i }));
      await waitFor(() => expect(screen.getByLabelText(/bank account number/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/bank account number/i), '123456789012');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/enter both account number and ifsc together/i)).toBeInTheDocument();
      });
    });

    it('rejects a malformed IFSC code client-side', async () => {
      mockFetch({
        onPatch: () => {
          throw new Error('PATCH should not have been called');
        },
      });

      renderPage();
      const user = userEvent.setup();

      await waitFor(() => expect(screen.getByDisplayValue('Sunrise Residency')).toBeInTheDocument());
      await user.click(screen.getByRole('tab', { name: /payment/i }));
      await waitFor(() => expect(screen.getByLabelText(/bank account number/i)).toBeInTheDocument());

      await user.type(screen.getByLabelText(/bank account number/i), '123456789012');
      await user.type(screen.getByLabelText(/ifsc code/i), 'not-an-ifsc');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText(/enter a valid 11-character ifsc code/i)).toBeInTheDocument();
      });
    });
  });
});
