import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Car, Save, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '../../components/data-table/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../../components/form-field/FormField';
import { authedFetch } from '../../lib/api';
import type { Vehicle } from './types';

async function fetchMyVehicles(): Promise<Vehicle[]> {
  const res = await authedFetch('/api/me/vehicles');
  if (!res.ok) throw new Error('Could not load your vehicles.');
  return res.json();
}

const vehicleFormSchema = z.object({
  plateNumber: z.string().min(1, 'Plate number is required'),
  type: z.enum(['TWO_WHEELER', 'FOUR_WHEELER']),
});
type VehicleFormValues = z.infer<typeof vehicleFormSchema>;

// Inline register form — no list<->form swap (FeeTypesPage's pattern) since a
// resident typically registers one or two vehicles, not enough to warrant
// hiding the list while adding another.
function VehicleForm() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<VehicleFormValues>({
    resolver: zodResolver(vehicleFormSchema),
    defaultValues: { plateNumber: '', type: 'FOUR_WHEELER' },
  });

  const mutation = useMutation<Vehicle, Error, VehicleFormValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/me/vehicles', { method: 'POST', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not add vehicle.');
      return body;
    },
    // Invalidate-and-refetch, not an optimistic cache append — same pattern
    // FeeTypesPage's createFeeType uses. The server's list is the source of
    // truth for what's actually registered.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-vehicles'] });
      reset({ plateNumber: '', type: 'FOUR_WHEELER' });
    },
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate className="mb-5">
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1fr_auto_auto] sm:items-start">
        <Field label="Plate number">
          <input aria-label="Plate number" className={inputClass} {...register('plateNumber')} />
          {errors.plateNumber && <ErrMsg>{errors.plateNumber.message}</ErrMsg>}
        </Field>
        <Field label="Type">
          <select aria-label="Vehicle type" className={inputClass} {...register('type')}>
            <option value="TWO_WHEELER">Two-wheeler</option>
            <option value="FOUR_WHEELER">Four-wheeler</option>
          </select>
        </Field>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70 sm:mt-6"
        >
          <Save size={14} /> {mutation.isPending ? 'Adding…' : 'Add vehicle'}
        </button>
      </div>
      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}
    </form>
  );
}

function DeleteVehicleButton({ vehicleId }: { vehicleId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch(`/api/me/vehicles/${vehicleId}`, { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not remove vehicle.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-vehicles'] }),
  });

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      aria-label="Delete vehicle"
      className="flex items-center gap-1 text-xs font-semibold text-coral disabled:opacity-70"
    >
      <Trash2 size={13} /> Remove
    </button>
  );
}

const TYPE_LABEL: Record<Vehicle['type'], string> = {
  TWO_WHEELER: 'Two-wheeler',
  FOUR_WHEELER: 'Four-wheeler',
};

export function VehicleInfoTab() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-vehicles'], queryFn: fetchMyVehicles });

  const columns = useMemo<ColumnDef<Vehicle, unknown>[]>(
    () => [
      {
        id: 'plateNumber',
        header: 'Plate number',
        cell: ({ row }) => <span className="font-mono-brand text-ink">{row.original.plateNumber}</span>,
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => TYPE_LABEL[row.original.type],
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <DeleteVehicleButton vehicleId={row.original.id} />,
      },
    ],
    [],
  );

  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <SectionHeader icon={Car} title="Your vehicles" />
      <p className="m-0 -mt-2 mb-4 text-xs text-muted">
        Register your vehicles so other residents can look up who a parked car belongs to via Vehicle
        Finder.
      </p>

      <VehicleForm />

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your vehicles.
        </p>
      )}
      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(v) => v.id}
          emptyMessage="No vehicles registered yet — add one above."
        />
      )}
    </div>
  );
}
