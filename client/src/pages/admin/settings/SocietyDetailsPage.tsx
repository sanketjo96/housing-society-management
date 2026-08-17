import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Landmark, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { Divider, ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../../../components/FormField';
import { FileUploadField } from '../../../components/FileUploadField';
import { SignaturePad } from '../../../components/SignaturePad';
import { authedFetch } from '../../../lib/api';
import { fetchOwners, fetchSettings, type CommitteeMember, type SocietySettings } from './settings-api';
import { SettingsFormActions } from './SettingsFormActions';

// Mirrors the server's format check (society-settings.controller.ts) — 4-letter
// bank code, a literal '0', then 6 alphanumeric branch chars, e.g. HDFC0001234.
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const TABS = [
  { value: 'basic', label: 'Basic information' },
  { value: 'committee', label: 'Committee' },
  { value: 'payment', label: 'Payment' },
] as const;
type Tab = (typeof TABS)[number]['value'];

// Split into three independently-saved forms (each its own mutation) rather than
// one combined submit — matches this app's existing PaymentProofsPage tab pattern,
// and means switching tabs never risks losing another tab's unsaved edits or
// silently re-sending fields the admin never touched on this visit.

// ---- Basic information ----

const basicInfoSchema = z.object({
  name: z.string().min(1, 'Society name is required'),
  address: z.string().min(1, 'Society address is required'),
  constructionDate: z.string().min(1, 'Construction date is required'),
  formationDate: z.string().min(1, 'Society formation date is required'),
});
type BasicInfoValues = z.infer<typeof basicInfoSchema>;

function basicInfoValuesFromSettings(settings: SocietySettings): BasicInfoValues {
  return {
    name: settings.name,
    address: settings.address,
    constructionDate: settings.constructionDate ?? '',
    formationDate: settings.formationDate ?? '',
  };
}

function BasicInfoTab({ settings }: { settings: SocietySettings }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<BasicInfoValues>({
    resolver: zodResolver(basicInfoSchema),
    defaultValues: basicInfoValuesFromSettings(settings),
  });

  useEffect(() => {
    reset(basicInfoValuesFromSettings(settings));
  }, [settings, reset]);

  const mutation = useMutation<SocietySettings, Error, BasicInfoValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save settings.');
      return body;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['society-settings'], updated);
      reset(basicInfoValuesFromSettings(updated));
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="rounded-2xl border border-line bg-white p-6"
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

      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Construction date">
          <input type="date" className={inputClass} {...register('constructionDate')} />
          {errors.constructionDate && <ErrMsg>{errors.constructionDate.message}</ErrMsg>}
        </Field>

        <Field label="Society formation date">
          <input type="date" className={inputClass} {...register('formationDate')} />
          {errors.formationDate && <ErrMsg>{errors.formationDate.message}</ErrMsg>}
        </Field>
      </div>

      <SettingsFormActions
        error={mutation.error?.message}
        saved={mutation.isSuccess && !isDirty}
        pending={mutation.isPending}
        disabled={mutation.isPending || !isDirty}
      />
    </form>
  );
}

// ---- Committee ----

const committeeSchema = z.object({
  chairmanId: z.string().min(1, 'Chairman is required'),
  secretaryId: z.string().min(1, 'Secretary is required'),
  treasurerId: z.string().min(1, 'Treasurer is required'),
});
type CommitteeValues = z.infer<typeof committeeSchema>;

function committeeValuesFromSettings(settings: SocietySettings): CommitteeValues {
  return {
    chairmanId: settings.chairman?.id ?? '',
    secretaryId: settings.secretary?.id ?? '',
    treasurerId: settings.treasurer?.id ?? '',
  };
}

// A plain <select> of the society's owners — nothing typed in, matches the
// confirmed requirement that committee roles are picked, not entered. Defined at
// module scope (not inline in CommitteeTab's render) so it isn't recreated as a new
// component type on every render, which would otherwise remount the <select> and
// drop focus.
function CommitteeSelectField({
  label,
  owners,
  ownersLoading,
  registration,
  error,
}: {
  label: string;
  owners: CommitteeMember[] | undefined;
  ownersLoading: boolean;
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <Field label={label}>
      <select className={inputClass} disabled={ownersLoading} {...registration}>
        <option value="" disabled>
          Select an owner…
        </option>
        {owners?.map((owner) => (
          <option key={owner.id} value={owner.id}>
            {owner.name} ({owner.email})
          </option>
        ))}
      </select>
      {error && <ErrMsg>{error}</ErrMsg>}
    </Field>
  );
}

// Authenticated preview thumbnail — GET .../signature is never a public path, so a
// plain <img src> won't carry the Bearer token; fetch it ourselves and hand the
// <img> a blob: URL, same pattern used for proof files elsewhere in this app.
// Parameterized by endpoint (one per committee role) rather than hardcoded.
function SignaturePreview({ endpoint, hasSignature, alt }: { endpoint: string; hasSignature: boolean; alt: string }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSignature) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    authedFetch(endpoint)
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
  }, [endpoint, hasSignature]);

  if (!previewUrl) return null;
  return (
    <img src={previewUrl} alt={alt} className="mb-2 h-16 rounded-lg border border-line bg-paper object-contain p-2" />
  );
}

const COMMITTEE_ROLE_PARAM: Record<'chairman' | 'secretary' | 'treasurer', string> = {
  chairman: 'chairman',
  secretary: 'secretary',
  treasurer: 'treasurer',
};

// Signing operates only on whoever is actually, currently, on record for this role
// — never on an unsaved dropdown pick. If the form's pending value differs from
// what's saved, this shows a "save first" note instead of the upload/draw widget.
// This isn't just a UX nicety: the backend clears a role's signature the instant
// its assignee id genuinely changes (society-settings.service.ts's
// isGenuineReassignment), so uploading "for" someone before their id is even saved
// would just get wiped out the moment Save runs afterward.
function CommitteeSignatureField({
  role,
  label,
  savedMemberId,
  pendingMemberId,
  hasSignature,
  onChanged,
}: {
  role: 'chairman' | 'secretary' | 'treasurer';
  label: string;
  savedMemberId: string;
  pendingMemberId: string;
  hasSignature: boolean;
  onChanged: (settings: SocietySettings) => void;
}) {
  const [mode, setMode] = useState<'upload' | 'draw'>('upload');
  const endpoint = `/api/admin/settings/committee/${COMMITTEE_ROLE_PARAM[role]}/signature`;

  const uploadMutation = useMutation<SocietySettings, Error, File>({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await authedFetch(endpoint, { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save the signature.');
      return body;
    },
    onSuccess: onChanged,
  });
  const removeMutation = useMutation<SocietySettings, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch(endpoint, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not remove the signature.');
      return body;
    },
    onSuccess: onChanged,
  });

  if (pendingMemberId !== savedMemberId) {
    return (
      <p className="mb-3.5 text-xs text-muted">Save the {label.toLowerCase()} change above before adding a signature.</p>
    );
  }
  if (!savedMemberId) return null; // required field — shouldn't render unassigned, but stay defensive

  return (
    <div className="mb-3.5">
      <SignaturePreview endpoint={endpoint} hasSignature={hasSignature} alt={`Current ${label.toLowerCase()} signature`} />
      {!hasSignature && (
        <p role="status" className="mb-1.5 text-xs font-semibold text-brass">
          No signature yet — required.
        </p>
      )}
      {/* Once a signature is set, only "Remove signature" is shown — upload/draw
          reappear the moment removal actually completes (hasSignature flips back
          to false via onChanged's refetch), not on click. */}
      {!hasSignature && (
        <>
          <div className="mb-2 flex gap-3">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`text-xs ${mode === 'upload' ? 'font-semibold text-teal' : 'text-muted'}`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`text-xs ${mode === 'draw' ? 'font-semibold text-teal' : 'text-muted'}`}
            >
              Draw
            </button>
          </div>
          {mode === 'upload' ? (
            <FileUploadField
              file={null}
              onFileChange={(file) => file && uploadMutation.mutate(file)}
              accept="image/png,image/jpeg,image/webp"
              placeholder={`Upload ${label.toLowerCase()} signature image`}
            />
          ) : (
            <SignaturePad onSave={(file) => uploadMutation.mutate(file)} />
          )}
        </>
      )}
      {hasSignature && (
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

function CommitteeTab({ settings }: { settings: SocietySettings }) {
  const queryClient = useQueryClient();
  const {
    data: owners,
    isLoading: ownersLoading,
    isError: ownersError,
  } = useQuery({ queryKey: ['society-owners'], queryFn: fetchOwners });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<CommitteeValues>({
    resolver: zodResolver(committeeSchema),
    defaultValues: committeeValuesFromSettings(settings),
  });

  // Re-applied once `owners` resolves too, not just `settings` — an already-assigned
  // role's <option> doesn't exist in the DOM until the owners list has loaded, so a
  // reset() that only fires on `settings` would set chairmanId to an option the
  // <select> doesn't have yet, and the browser silently falls back to the first
  // (blank) option instead.
  useEffect(() => {
    reset(committeeValuesFromSettings(settings));
  }, [settings, owners, reset]);

  const mutation = useMutation<SocietySettings, Error, CommitteeValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save settings.');
      return body;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['society-settings'], updated);
      reset(committeeValuesFromSettings(updated));
    },
  });

  // A signature change (upload/remove) never touches chairmanId et al., so the
  // committee form itself doesn't need resetting — just refresh the shared cache
  // the way every other settings mutation in this file already does.
  function handleSignatureChanged(updated: SocietySettings) {
    queryClient.setQueryData(['society-settings'], updated);
  }

  const pendingChairmanId = watch('chairmanId');
  const pendingSecretaryId = watch('secretaryId');
  const pendingTreasurerId = watch('treasurerId');

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="rounded-2xl border border-line bg-white p-6"
    >
      <SectionHeader icon={Users} title="Managing committee" />
      <p className="m-0 mb-3.5 text-xs text-muted">
        Pick from the society's current owners — nothing to type here. All three roles are required.
      </p>

      {ownersError && (
        <p role="alert" className="mb-3.5 text-xs text-coral">
          Could not load the owners list.
        </p>
      )}

      <CommitteeSelectField
        label="Chairman"
        owners={owners}
        ownersLoading={ownersLoading}
        registration={register('chairmanId')}
        error={errors.chairmanId?.message}
      />
      <CommitteeSignatureField
        role="chairman"
        label="Chairman"
        savedMemberId={settings.chairman?.id ?? ''}
        pendingMemberId={pendingChairmanId}
        hasSignature={settings.hasChairmanSignature}
        onChanged={handleSignatureChanged}
      />

      <CommitteeSelectField
        label="Secretary"
        owners={owners}
        ownersLoading={ownersLoading}
        registration={register('secretaryId')}
        error={errors.secretaryId?.message}
      />
      <CommitteeSignatureField
        role="secretary"
        label="Secretary"
        savedMemberId={settings.secretary?.id ?? ''}
        pendingMemberId={pendingSecretaryId}
        hasSignature={settings.hasSecretarySignature}
        onChanged={handleSignatureChanged}
      />

      <CommitteeSelectField
        label="Treasurer"
        owners={owners}
        ownersLoading={ownersLoading}
        registration={register('treasurerId')}
        error={errors.treasurerId?.message}
      />
      <CommitteeSignatureField
        role="treasurer"
        label="Treasurer"
        savedMemberId={settings.treasurer?.id ?? ''}
        pendingMemberId={pendingTreasurerId}
        hasSignature={settings.hasTreasurerSignature}
        onChanged={handleSignatureChanged}
      />

      <SettingsFormActions
        error={mutation.error?.message}
        saved={mutation.isSuccess && !isDirty}
        pending={mutation.isPending}
        disabled={mutation.isPending || !isDirty || ownersLoading}
      />
    </form>
  );
}

// ---- Payment ----

const paymentSchema = z
  .object({
    // Both optional — a society configures either a UPI VPA or a bank account
    // number + IFSC pair (or both, in which case UPI always takes precedence for
    // the resident-facing Pay flow — see ledger.service.ts's
    // buildPaymentIntentResult). Empty strings are valid ("not configured").
    upiVpa: z.string(),
    bankAccountNumber: z.string(),
    bankIfsc: z
      .string()
      .refine((v) => v === '' || IFSC_REGEX.test(v), 'Enter a valid 11-character IFSC code, e.g. HDFC0001234'),
  })
  .refine((v) => (v.bankAccountNumber === '') === (v.bankIfsc === ''), {
    message: 'Enter both account number and IFSC together, or leave both blank',
    path: ['bankAccountNumber'],
  });
type PaymentValues = z.infer<typeof paymentSchema>;

function paymentValuesFromSettings(settings: SocietySettings): PaymentValues {
  return {
    upiVpa: settings.upiVpa ?? '',
    bankAccountNumber: settings.bankAccountNumber ?? '',
    bankIfsc: settings.bankIfsc ?? '',
  };
}

function PaymentTab({ settings }: { settings: SocietySettings }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PaymentValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: paymentValuesFromSettings(settings),
  });

  useEffect(() => {
    reset(paymentValuesFromSettings(settings));
  }, [settings, reset]);

  const mutation = useMutation<SocietySettings, Error, PaymentValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/admin/settings', { method: 'PATCH', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save settings.');
      return body;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['society-settings'], updated);
      reset(paymentValuesFromSettings(updated));
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="rounded-2xl border border-line bg-white p-6"
    >
      <SectionHeader icon={Landmark} title="Payment collection" />
      <p className="m-0 mb-3.5 text-xs text-muted">
        Configure either a UPI ID or a bank account number + IFSC (or both). UPI always takes
        precedence when both are set — a resident only ever sees a QR code, or account details,
        never both.
      </p>

      <Field label="UPI ID (VPA)">
        <input className={inputClass} placeholder="society-name@bank" {...register('upiVpa')} />
        {errors.upiVpa && <ErrMsg>{errors.upiVpa.message}</ErrMsg>}
      </Field>
      <p className="m-0 -mt-2 mb-3.5 text-xs text-muted">
        The UPI address residents' payment QR codes encode. Update this whenever the society's
        collection account changes — takes effect on the very next QR a resident generates. Leave
        blank to use bank transfer instead.
      </p>

      <Divider />

      <Field label="Bank account number">
        <input className={inputClass} placeholder="e.g. 123456789012" {...register('bankAccountNumber')} />
        {errors.bankAccountNumber && <ErrMsg>{errors.bankAccountNumber.message}</ErrMsg>}
      </Field>

      <Field label="IFSC code">
        <input className={inputClass} placeholder="e.g. HDFC0001234" {...register('bankIfsc')} />
        {errors.bankIfsc && <ErrMsg>{errors.bankIfsc.message}</ErrMsg>}
      </Field>
      <p className="m-0 -mt-2 mb-3.5 text-xs text-muted">
        Shown to residents instead of a QR code whenever no UPI ID is set above. Enter both, or
        leave both blank.
      </p>

      <SettingsFormActions
        error={mutation.error?.message}
        saved={mutation.isSuccess && !isDirty}
        pending={mutation.isPending}
        disabled={mutation.isPending || !isDirty}
      />
    </form>
  );
}

export function SocietyDetailsPage() {
  const [tab, setTab] = useState<Tab>('basic');
  const { data, isLoading, isError } = useQuery({ queryKey: ['society-settings'], queryFn: fetchSettings });

  return (
    <div>
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Society details</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">
          Identity, committee, and payment info shown to residents and printed on receipts.
        </p>
      </div>

      <div className="mb-4 flex gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
              tab === t.value ? 'bg-teal text-white' : 'border border-line text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load settings.
        </p>
      )}

      {data && tab === 'basic' && <BasicInfoTab settings={data} />}
      {data && tab === 'committee' && <CommitteeTab settings={data} />}
      {data && tab === 'payment' && <PaymentTab settings={data} />}
    </div>
  );
}
