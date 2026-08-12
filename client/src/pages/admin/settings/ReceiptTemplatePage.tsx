import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PenTool, Receipt as ReceiptIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../../../components/FormField';
import { FileUploadField } from '../../../components/FileUploadField';
import { authedFetch } from '../../../lib/api';
import { fetchSettings, type SocietySettings } from './settings-api';
import { SettingsFormActions } from './SettingsFormActions';

const formSchema = z.object({
  receiptNumberPrefix: z.string().regex(/^[A-Za-z0-9-]{1,20}$/, 'Use 1-20 letters, digits, or hyphens'),
  // Empty strings are valid here (they clear the field server-side) — only the
  // prefix above is non-empty-required.
  receiptSignatoryName: z.string(),
  receiptSignatoryTitle: z.string(),
  receiptFooterNote: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

function formValuesFromSettings(settings: SocietySettings): FormValues {
  return {
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

export function ReceiptTemplatePage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['society-settings'], queryFn: fetchSettings });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      receiptNumberPrefix: '',
      receiptSignatoryName: '',
      receiptSignatoryTitle: '',
      receiptFooterNote: '',
    },
  });

  // Form fields can't be pre-filled until the GET resolves, so sync them in once data
  // arrives — same pattern as every other edit form in this app (e.g. FlatForm).
  useEffect(() => {
    if (data) reset(formValuesFromSettings(data));
  }, [data, reset]);

  const mutation = useMutation<SocietySettings, Error, FormValues>({
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
    <div>
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Receipt template</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">
          Changes here only affect receipts issued after saving — an already-issued receipt is never
          retroactively altered.
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
            <SectionHeader icon={ReceiptIcon} title="Receipt template" />

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

            <SettingsFormActions
              error={mutation.error?.message}
              saved={mutation.isSuccess && !isDirty}
              pending={mutation.isPending}
              disabled={mutation.isPending || !isDirty}
            />
          </form>

          <div className="rounded-2xl border border-line bg-white p-6">
            <SignatureSection settings={data} onChanged={handleSignatureChanged} />
          </div>
        </>
      )}
    </div>
  );
}
