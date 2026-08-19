import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Check, Plus, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '../../../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../../../components/FormField';
import { authedFetch } from '../../../lib/api';

interface FeeType {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

async function fetchFeeTypes(): Promise<FeeType[]> {
  const res = await authedFetch('/api/admin/fee-types?includeInactive=true');
  if (!res.ok) throw new Error('Could not load fee types.');
  return res.json();
}

const feeTypeFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

type FeeTypeFormValues = z.infer<typeof feeTypeFormSchema>;

// Same list<->form swap pattern as FlatsListPage.tsx's FlatForm — the only other
// DataTable-with-add page in this app. No separate shared component, since this
// form is small enough to stay inline.
function FeeTypeForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FeeTypeFormValues>({ resolver: zodResolver(feeTypeFormSchema) });

  const mutation = useMutation<unknown, Error, FeeTypeFormValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/admin/fee-types', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not create fee type.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-fee-types'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="rounded-2xl border border-line bg-white p-6"
    >
      <button
        type="button"
        onClick={onDone}
        className="mb-4 flex items-center gap-1.5 border-none bg-transparent p-0 text-xs text-muted"
      >
        <ArrowLeft size={13} /> Back to list
      </button>

      <h1 className="m-0 mb-4 font-display text-lg text-ink">Add fee type</h1>

      <Field label="Name">
        <input className={inputClass} {...register('name')} />
        {errors.name && <ErrMsg>{errors.name.message}</ErrMsg>}
      </Field>
      <Field label="Description (optional)">
        <textarea rows={2} className={inputClass} {...register('description')} />
      </Field>

      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-2 flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        <Save size={14} /> {mutation.isPending ? 'Saving…' : 'Save fee type'}
      </button>
    </form>
  );
}

function ToggleActiveButton({ feeType }: { feeType: FeeType }) {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch(`/api/admin/fee-types/${feeType.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !feeType.isActive }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not update fee type.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-fee-types'] }),
  });

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink disabled:opacity-70"
    >
      {feeType.isActive ? 'Deactivate' : 'Reactivate'}
    </button>
  );
}

export function FeeTypesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-fee-types'],
    queryFn: fetchFeeTypes,
  });

  const columns = useMemo<ColumnDef<FeeType, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.name}
            {row.original.description && (
              <div className="text-xs text-muted">{row.original.description}</div>
            )}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? (
            <span className="flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-1 text-xs font-semibold text-teal">
              <Check size={12} /> Active
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-muted">
              <X size={12} /> Inactive
            </span>
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <ToggleActiveButton feeType={row.original} />,
      },
    ],
    [],
  );

  if (showForm) {
    return (
      <div className="mx-auto max-w-4xl">
        <FeeTypeForm onDone={() => setShowForm(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-xl text-ink">Fee types</h1>
          <p className="m-0 mt-0.5 text-xs text-muted">
            The catalog of Other Charges fee types (joining fee, transfer fee, fine, ...) available when
            billing a flat from the Other Charges page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={14} /> Add fee type
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load fee types.
        </p>
      )}

      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(f) => f.id}
          emptyMessage="No fee types yet — add one above."
        />
      )}
    </div>
  );
}
