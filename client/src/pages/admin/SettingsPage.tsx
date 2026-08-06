import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Check, Settings as SettingsIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Divider, ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../../components/FormField';
import { authedFetch } from '../../lib/api';

export interface SocietySettings {
  name: string;
  upiVpa: string;
  tenantRateFactor: number;
  defaultBaseRate: number;
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
  upiVpa: z.string().min(1, 'UPI ID is required'),
  defaultBaseRate: z.coerce.number().positive('Default base rate must be a positive number'),
  tenantRateFactor: z.coerce
    .number()
    .positive('Occupancy factor must be a positive number')
    .max(9.99, 'Occupancy factor must be 9.99 or less'),
});

type SettingsFormInput = z.input<typeof settingsFormSchema>;
type SettingsFormValues = z.infer<typeof settingsFormSchema>;

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
    defaultValues: { name: '', upiVpa: '', defaultBaseRate: undefined, tenantRateFactor: undefined },
  });

  // Form fields can't be pre-filled until the GET resolves, so sync them in once data
  // arrives — same pattern as every other edit form in this app (e.g. FlatForm), just
  // deferred a tick here since this page has no separate "loaded flat" prop to key off.
  useEffect(() => {
    if (data) {
      reset({
        name: data.name,
        upiVpa: data.upiVpa,
        defaultBaseRate: data.defaultBaseRate,
        tenantRateFactor: data.tenantRateFactor,
      });
    }
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
      reset({
        name: settings.name,
        upiVpa: settings.upiVpa,
        defaultBaseRate: settings.defaultBaseRate,
        tenantRateFactor: settings.tenantRateFactor,
      });
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Settings</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">
          These values drive every maintenance-rate calculation society-wide.
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
      )}
    </div>
  );
}
