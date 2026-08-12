import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrMsg, Field, inputClass, SectionHeader } from '../../../components/FormField';
import { authedFetch } from '../../../lib/api';
import { fetchSettings, type SocietySettings } from './settings-api';
import { SettingsFormActions } from './SettingsFormActions';

const formSchema = z.object({
  defaultBaseRate: z.coerce.number().positive('Default base rate must be a positive number'),
  tenantRateFactor: z.coerce
    .number()
    .positive('Occupancy factor must be a positive number')
    .max(9.99, 'Occupancy factor must be 9.99 or less'),
});

type FormInput = z.input<typeof formSchema>;
type FormValues = z.infer<typeof formSchema>;

function formValuesFromSettings(settings: SocietySettings): FormValues {
  return { defaultBaseRate: settings.defaultBaseRate, tenantRateFactor: settings.tenantRateFactor };
}

export function BillingPlanPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ['society-settings'], queryFn: fetchSettings });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { defaultBaseRate: undefined, tenantRateFactor: undefined },
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
        <h1 className="m-0 font-display text-xl text-ink">Billing plan</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">The current defaults every maintenance-rate calculation uses.</p>
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
          <SectionHeader icon={Wallet} title="Billing defaults" />

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
