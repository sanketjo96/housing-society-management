import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, PenTool, Receipt as ReceiptIcon, Settings as SettingsIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Divider, ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../../components/FormField';
import { FileUploadField } from '../../components/FileUploadField';
import { authedFetch } from '../../lib/api';

export interface SocietySettings {
  name: string;
  address: string;
  upiVpa: string;
  tenantRateFactor: number;
  defaultBaseRate: number;
  // Receipt template customization (Receipt Generation & Approval Workflow,
  // 2026-08-11) — see docs/receipts.md.
  receiptNumberPrefix: string;
  receiptSignatoryName: string | null;
  receiptSignatoryTitle: string | null;
  receiptFooterNote: string | null;
  hasSignature: boolean;
}

// Exported so FlatsListPage's FlatForm can share the same query (key + fetcher) to
// pre-fill a new flat's base rate — one cached settings fetch, not two.
export async function fetchSettings(): Promise<SocietySettings> {
  const res = await authedFetch('/api/admin/settings');
  if (!res.ok) throw new Error('Could not load settings.');
  return res.json();
}

const settingsFormSchema = z.object({
  name: z.string().min(1, 'Society name is required'),
  address: z.string().min(1, 'Society address is required'),
  upiVpa: z.string().min(1, 'UPI ID is required'),
  defaultBaseRate: z.coerce.number().positive('Default base rate must be a positive number'),
  tenantRateFactor: z.coerce
    .number()
    .positive('Occupancy factor must be a positive number')
    .max(9.99, 'Occupancy factor must be 9.99 or less'),
  receiptNumberPrefix: z
    .string()
    .regex(/^[A-Za-z0-9-]{1,20}$/, 'Use 1-20 letters, digits, or hyphens'),
  // Empty strings are valid here (they clear the field server-side) — only the
  // core/prefix fields above are non-empty-required.
  receiptSignatoryName: z.string(),
  receiptSignatoryTitle: z.string(),
  receiptFooterNote: z.string(),
});

type SettingsFormInput = z.input<typeof settingsFormSchema>;
type SettingsFormValues = z.infer<typeof settingsFormSchema>;

function formValuesFromSettings(settings: SocietySettings): SettingsFormValues {
  return {
    name: settings.name,
    address: settings.address,
    upiVpa: settings.upiVpa,
    defaultBaseRate: settings.defaultBaseRate,
    tenantRateFactor: settings.tenantRateFactor,
    receiptNumberPrefix: settings.receiptNumberPrefix,
    receiptSignatoryName: settings.receiptSignatoryName ?? '',
    receiptSignatoryTitle: settings.receiptSignatoryTitle ?? '',
    receiptFooterNote: settings.receiptFooterNote ?? '',
  };
}

// Authenticated preview thumbnail — GET /api/admin/settings/signature is never a
// public path, so a plain <img src> won't carry the Bearer token; fetch it
// ourselves and hand the <img> a blob: URL, same pattern used for proof files and
// the receipt-preview PDF elsewhere in this app.
function SignaturePreview({ hasSignature }: { hasSignature: boolean }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSignature) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    authedFetch('/api/admin/settings/signature')
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      })
      .catch(() => {
        // A broken preview fetch just means no thumbnail shows — not worth its own
        // error banner on a settings page.
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [hasSignature]);

  if (!previewUrl) return null;
  return (
    <img
      src={previewUrl}
      alt="Current treasurer signature"
      className="mb-3 h-16 rounded-lg border border-line bg-paper object-contain p-2"
    />
  );
}

// Separate from the main form/submit — a file action doesn't belong inside a
// single-submit text form, same reasoning as FlatsListPage's CSV import panel:
// selecting a file uploads it immediately via its own mutation.
function SignatureSection({
  settings,
  onChanged,
}: {
  settings: SocietySettings;
  onChanged: (settings: SocietySettings) => void;
}) {
  const uploadMutation = useMutation<SocietySettings, Error, File>({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authedFetch('/api/admin/settings/signature', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not upload the signature.');
      return body;
    },
    onSuccess: onChanged,
  });

  const removeMutation = useMutation<SocietySettings, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch('/api/admin/settings/signature', { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not remove the signature.');
      return body;
    },
    onSuccess: onChanged,
  });

  return (
    <div>
      <SectionHeader icon={PenTool} title="Treasurer signature" />
      <p className="m-0 mb-3.5 text-xs text-muted">
        Displays above the signatory name on every generated receipt, replacing the blank signature
        line. PNG with a transparent background recommended. Optional — receipts work without one.
      </p>

      <SignaturePreview hasSignature={settings.hasSignature} />

      <FileUploadField
        file={null}
        onFileChange={(file) => file && uploadMutation.mutate(file)}
        accept="image/png,image/jpeg,image/webp"
        placeholder={settings.hasSignature ? 'Replace signature image' : 'Upload signature image (optional)'}
      />

      {settings.hasSignature && (
        <button
          type="button"
          onClick={() => removeMutation.mutate()}
          disabled={removeMutation.isPending}
          className="mt-2.5 text-xs font-semibold text-coral disabled:opacity-70"
        >
          {removeMutation.isPending ? 'Removing…' : 'Remove signature'}
        </button>
      )}

      {uploadMutation.error && <ErrorBanner>{uploadMutation.error.message}</ErrorBanner>}
      {removeMutation.error && <ErrorBanner>{removeMutation.error.message}</ErrorBanner>}
    </div>
  );
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['society-settings'], queryFn: fetchSettings });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsFormInput, unknown, SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      name: '',
      address: '',
      upiVpa: '',
      defaultBaseRate: undefined,
      tenantRateFactor: undefined,
      receiptNumberPrefix: '',
      receiptSignatoryName: '',
      receiptSignatoryTitle: '',
      receiptFooterNote: '',
    },
  });

  // Form fields can't be pre-filled until the GET resolves, so sync them in once data
  // arrives — same pattern as every other edit form in this app (e.g. FlatForm), just
  // deferred a tick here since this page has no separate "loaded flat" prop to key off.
  useEffect(() => {
    if (data) reset(formValuesFromSettings(data));
  }, [data, reset]);

  const mutation = useMutation<SocietySettings, Error, SettingsFormValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save settings.');
      return body;
    },
    onSuccess: (settings) => {
      queryClient.setQueryData(['society-settings'], settings);
      reset(formValuesFromSettings(settings));
    },
  });

  // The signature endpoints return the full updated SocietySettings too — reuse the
  // exact same cache-update path as the main form's save, no separate signature
  // query needed.
  function handleSignatureChanged(settings: SocietySettings) {
    queryClient.setQueryData(['society-settings'], settings);
    reset(formValuesFromSettings(settings));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Settings</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">
          These values drive every maintenance-rate calculation and receipt society-wide.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load settings.
        </p>
      )}

      {data && (
        <>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            noValidate
            className="mb-5 rounded-2xl border border-line bg-white p-6"
          >
            <SectionHeader icon={Building2} title="Society details" />

            <Field label="Society name">
              <input className={inputClass} {...register('name')} />
              {errors.name && <ErrMsg>{errors.name.message}</ErrMsg>}
            </Field>

            <Field label="Society address">
              <input className={inputClass} {...register('address')} />
              {errors.address && <ErrMsg>{errors.address.message}</ErrMsg>}
            </Field>
            <p className="m-0 -mt-2 mb-3.5 text-xs text-muted">
              Printed on every generated receipt's letterhead, alongside the society name.
            </p>

            <Field label="UPI ID (VPA)">
              <input className={inputClass} placeholder="society-name@bank" {...register('upiVpa')} />
              {errors.upiVpa && <ErrMsg>{errors.upiVpa.message}</ErrMsg>}
            </Field>
            <p className="m-0 -mt-2 mb-3.5 text-xs text-muted">
              The UPI address residents' payment QR codes encode. Update this whenever the society's
              collection account changes — takes effect on the very next QR a resident generates.
            </p>

            <Divider />

            <SectionHeader icon={SettingsIcon} title="Billing defaults" />

            <Field label="Default base rate (₹ / month)">
              <input type="number" step="0.01" className={inputClass} {...register('defaultBaseRate')} />
              {errors.defaultBaseRate && <ErrMsg>{errors.defaultBaseRate.message}</ErrMsg>}
            </Field>
            <p className="m-0 -mt-2 mb-3.5 text-xs text-muted">
              Pre-fills the base rate when onboarding a new flat. Doesn't change any flat's rate that's
              already set — each flat's own base rate stays independently editable from Flats and
              residents.
            </p>

            <Field label="Tenant occupancy factor (×)">
              <input type="number" step="0.01" className={inputClass} {...register('tenantRateFactor')} />
              {errors.tenantRateFactor && <ErrMsg>{errors.tenantRateFactor.message}</ErrMsg>}
            </Field>
            <p className="m-0 -mt-2 mb-3.5 text-xs text-muted">
              The multiplier applied to a flat's base rate when it's tenant-occupied. Owner-occupied
              flats always bill at 1× base rate, unaffected by this value. Takes effect immediately for
              any maintenance record generated after saving.
            </p>

            <Divider />

            <SectionHeader icon={ReceiptIcon} title="Receipt template" />
            <p className="m-0 mb-3.5 text-xs text-muted">
              Changes here only affect receipts issued after saving — an already-issued receipt is
              never retroactively altered.
            </p>

            <Field label="Receipt number prefix">
              <input className={inputClass} placeholder="RCPT" {...register('receiptNumberPrefix')} />
              {errors.receiptNumberPrefix && <ErrMsg>{errors.receiptNumberPrefix.message}</ErrMsg>}
            </Field>
            <p className="m-0 -mt-2 mb-3.5 text-xs text-muted">
              Combined with the flat number and transaction id to form every receipt number, e.g.{' '}
              <span className="font-mono-brand">RCPT-A101-...</span>.
            </p>

            <Field label="Signatory name">
              <input className={inputClass} placeholder="e.g. Ramesh Kulkarni" {...register('receiptSignatoryName')} />
              {errors.receiptSignatoryName && <ErrMsg>{errors.receiptSignatoryName.message}</ErrMsg>}
            </Field>

            <Field label="Signatory title">
              <input className={inputClass} placeholder="e.g. Treasurer" {...register('receiptSignatoryTitle')} />
              {errors.receiptSignatoryTitle && <ErrMsg>{errors.receiptSignatoryTitle.message}</ErrMsg>}
            </Field>

            <Field label="Footer note">
              <input
                className={inputClass}
                placeholder="e.g. This is a computer-generated receipt."
                {...register('receiptFooterNote')}
              />
              {errors.receiptFooterNote && <ErrMsg>{errors.receiptFooterNote.message}</ErrMsg>}
            </Field>

            {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}
            {mutation.isSuccess && !isDirty && (
              <p className="mb-3.5 flex items-center gap-1.5 text-xs font-semibold text-teal">
                <Check size={13} /> Saved.
              </p>
            )}

            <button
              type="submit"
              disabled={mutation.isPending || !isDirty}
              className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
            >
              {mutation.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </form>

          <div className="rounded-2xl border border-line bg-white p-6">
            <SignatureSection settings={data} onChanged={handleSignatureChanged} />
          </div>
        </>
      )}
    </div>
  );
}
