import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Landmark } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Divider, ErrMsg, Field, inputClass, SectionHeader } from '../../../components/FormField';
import { authedFetch } from '../../../lib/api';
import { fetchSettings, type SocietySettings } from './settings-api';
import { SettingsFormActions } from './SettingsFormActions';

// Mirrors the server's format check (society-settings.controller.ts) — 4-letter
// bank code, a literal '0', then 6 alphanumeric branch chars, e.g. HDFC0001234.
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const formSchema = z
  .object({
    name: z.string().min(1, 'Society name is required'),
    address: z.string().min(1, 'Society address is required'),
    // Both optional now — a society configures either a UPI VPA or a bank account
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

type FormValues = z.infer<typeof formSchema>;

function formValuesFromSettings(settings: SocietySettings): FormValues {
  return {
    name: settings.name,
    address: settings.address,
    upiVpa: settings.upiVpa ?? '',
    bankAccountNumber: settings.bankAccountNumber ?? '',
    bankIfsc: settings.bankIfsc ?? '',
  };
}

export function SocietyDetailsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['society-settings'], queryFn: fetchSettings });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', address: '', upiVpa: '', bankAccountNumber: '', bankIfsc: '' },
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Society details</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">
          Identity and payment info shown to residents and printed on receipts.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load settings.
        </p>
      )}

      {data && (
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

          <Divider />

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
      )}
    </div>
  );
}
