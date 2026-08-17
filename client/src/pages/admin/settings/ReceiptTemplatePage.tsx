import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PenTool, Receipt as ReceiptIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ErrMsg, Field, inputClass, SectionHeader } from '../../../components/FormField';
import { authedFetch } from '../../../lib/api';
import { fetchSettings, type SocietySettings } from './settings-api';
import { SettingsFormActions } from './SettingsFormActions';

const formSchema = z.object({
  receiptNumberPrefix: z.string().regex(/^[A-Za-z0-9-]{1,20}$/, 'Use 1-20 letters, digits, or hyphens'),
  // Empty is valid (clears the field server-side) — only the prefix above is
  // non-empty-required.
  receiptFooterNote: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

function formValuesFromSettings(settings: SocietySettings): FormValues {
  return {
    receiptNumberPrefix: settings.receiptNumberPrefix,
    receiptFooterNote: settings.receiptFooterNote ?? '',
  };
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
            <SectionHeader icon={PenTool} title="Chairman & secretary signatures" />
            <p className="m-0 text-xs text-muted">
              Every receipt is signed by the society's Chairman and Secretary, using their names and
              signature images from <span className="font-semibold">Society details → Committee</span>{' '}
              tab.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
