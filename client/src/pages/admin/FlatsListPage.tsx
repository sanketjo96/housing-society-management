import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Check, Home, Plus, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '../../components/DataTable';
import { OccupancyFields, OwnerDetailsFields } from '../../components/FlatFieldsForm';
import { Divider, ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../../components/FormField';
import { authedFetch } from '../../lib/api';
import type { ResidentSummary } from '../../types';
import { fetchSettings } from './settings/settings-api';

interface FlatSummary {
  id: string;
  wing: string;
  flatNumber: string;
  baseRate: string;
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
}

async function fetchFlats(): Promise<FlatSummary[]> {
  const res = await authedFetch('/api/admin/flats');
  if (!res.ok) throw new Error('Could not load flats.');
  return res.json();
}

// Always shaped like "create" (wing/flatNumber included) — in edit mode they're
// rendered disabled and simply excluded from the PATCH payload the mutation sends,
// rather than needing a second parallel schema/type for the same form.
const flatFormSchema = z
  .object({
    wing: z.string().min(1, 'Wing is required'),
    flatNumber: z.string().min(1, 'Flat number is required'),
    baseRate: z.coerce.number().positive('Base rate must be a positive number'),
    ownerName: z.string().min(1, "Owner's name is required"),
    ownerPhone: z.string().optional(),
    ownerEmail: z.string().email('Enter a valid email address'),
    occupancy: z.enum(['owner', 'tenant']),
    tenantName: z.string().optional(),
    tenantPhone: z.string().optional(),
    tenantEmail: z.string().optional(),
    effectiveFrom: z.string().optional(),
  })
  .refine((data) => data.occupancy !== 'tenant' || (!!data.tenantName && !!data.tenantEmail), {
    message: 'Tenant name and email are required when tenant-occupied',
    path: ['tenantEmail'],
  });

type FlatFormInput = z.input<typeof flatFormSchema>;
type FlatFormValues = z.infer<typeof flatFormSchema>;

function FlatForm({
  flat,
  defaultBaseRate,
  onDone,
}: {
  flat?: FlatSummary;
  defaultBaseRate?: number;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!flat;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FlatFormInput, unknown, FlatFormValues>({
    resolver: zodResolver(flatFormSchema),
    defaultValues: {
      wing: flat?.wing ?? '',
      flatNumber: flat?.flatNumber ?? '',
      baseRate: flat ? Number(flat.baseRate) : undefined,
      ownerName: flat?.owner.name ?? '',
      ownerPhone: flat?.owner.phone ?? '',
      ownerEmail: flat?.owner.email ?? '',
      occupancy: flat?.currentTenant ? 'tenant' : 'owner',
      tenantName: flat?.currentTenant?.name ?? '',
      tenantPhone: flat?.currentTenant?.phone ?? '',
      tenantEmail: flat?.currentTenant?.email ?? '',
      effectiveFrom: '',
    },
  });

  const occupancy = watch('occupancy');

  // New flats are pre-filled from the admin Billing plan page's default base rate
  // (2026-08-06 addendum), purely a starting point still freely editable before
  // saving. Applied via effect rather than useForm's defaultValues, since the
  // Settings fetch (in the parent) can resolve after this form has already mounted —
  // defaultValues are captured once at mount and wouldn't pick up a later value. Only
  // fires while the field is still untouched, so it can never clobber something the
  // admin already typed.
  useEffect(() => {
    if (!isEdit && defaultBaseRate !== undefined && !getValues('baseRate')) {
      setValue('baseRate', defaultBaseRate);
    }
  }, [isEdit, defaultBaseRate, getValues, setValue]);

  const mutation = useMutation<unknown, Error, FlatFormValues>({
    mutationFn: async (values) => {
      const path = isEdit ? `/api/admin/flats/${flat.id}` : '/api/admin/flats';
      const method = isEdit ? 'PATCH' : 'POST';
      // wing/flatNumber are immutable once a flat exists — updateFlat's contract
      // doesn't accept them, so they're simply not sent in edit mode.
      const body = isEdit
        ? {
            baseRate: values.baseRate,
            ownerName: values.ownerName,
            ownerPhone: values.ownerPhone,
            ownerEmail: values.ownerEmail,
            occupancy: values.occupancy,
            tenantName: values.tenantName,
            tenantPhone: values.tenantPhone,
            tenantEmail: values.tenantEmail,
            effectiveFrom: values.effectiveFrom || undefined,
          }
        : values;
      const res = await authedFetch(path, { method, body: JSON.stringify(body) });
      const responseBody = await res.json().catch(() => null);
      if (!res.ok) throw new Error(responseBody?.error ?? 'Could not save flat.');
      return responseBody;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-flats'] });
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

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="m-0 font-display text-lg text-ink">
            {isEdit ? `Flat ${flat.wing}-${flat.flatNumber}` : 'Onboard a flat'}
          </h1>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {isEdit ? 'Editing existing flat' : "This flat hasn't been onboarded yet"}
          </p>
        </div>
        {isEdit && (
          <span className="flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-1 text-xs font-semibold text-teal">
            <Check size={12} /> Onboarded
          </span>
        )}
      </div>

      <SectionHeader icon={Home} title="Flat details" />
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Wing">
          <input className={inputClass} disabled={isEdit} {...register('wing')} />
          {errors.wing && <ErrMsg>{errors.wing.message}</ErrMsg>}
        </Field>
        <Field label="Flat number">
          <input className={inputClass} disabled={isEdit} {...register('flatNumber')} />
          {errors.flatNumber && <ErrMsg>{errors.flatNumber.message}</ErrMsg>}
        </Field>
      </div>
      <Field label="Base maintenance rate (₹ / month)">
        <input type="number" step="0.01" className={inputClass} {...register('baseRate')} />
        {errors.baseRate && <ErrMsg>{errors.baseRate.message}</ErrMsg>}
      </Field>

      <Divider />

      <OwnerDetailsFields register={register} errors={errors} />

      <Divider />

      <OccupancyFields
        register={register}
        errors={errors}
        occupancy={occupancy}
        onOccupancyChange={(value) => setValue('occupancy', value)}
      />

      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-5 flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        <Save size={14} /> {mutation.isPending ? 'Saving…' : 'Save flat'}
      </button>
    </form>
  );
}

function occupancyLabel(flat: FlatSummary) {
  return flat.currentTenant ? 'Tenant' : 'Owner';
}

export function FlatsListPage() {
  const [editingId, setEditingId] = useState<string | null | 'new'>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-flats'], queryFn: fetchFlats });
  // Fetched here too (not just on the Billing plan page) so a new flat's base rate
  // can be pre-filled even if the admin never opens Billing plan this session.
  const { data: settings } = useQuery({ queryKey: ['society-settings'], queryFn: fetchSettings });

  const columns = useMemo<ColumnDef<FlatSummary, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            {row.original.wing}-{row.original.flatNumber}
          </span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.owner.name}
            <div className="text-xs text-muted">{row.original.owner.email}</div>
          </span>
        ),
      },
      {
        id: 'occupancy',
        header: 'Occupancy',
        cell: ({ row }) => <span className="text-muted">{occupancyLabel(row.original)}</span>,
      },
      {
        id: 'tenant',
        header: 'Tenant',
        cell: ({ row }) =>
          row.original.currentTenant ? (
            <span className="text-ink">
              {row.original.currentTenant.name}
              <div className="text-xs text-muted">{row.original.currentTenant.email}</div>
            </span>
          ) : (
            <span className="text-muted">—</span>
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => setEditingId(row.original.id)}
            className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink"
          >
            Edit
          </button>
        ),
      },
    ],
    [],
  );

  if (editingId === 'new') {
    return (
      <div className="mx-auto max-w-4xl">
        <FlatForm defaultBaseRate={settings?.defaultBaseRate} onDone={() => setEditingId(null)} />
      </div>
    );
  }

  const editingFlat = data?.find((f) => f.id === editingId);
  if (editingFlat) {
    return (
      <div className="mx-auto max-w-4xl">
        <FlatForm flat={editingFlat} onDone={() => setEditingId(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-xl text-ink">Flats and residents</h1>
          <p className="m-0 mt-0.5 text-xs text-muted">{data?.length ?? 0} onboarded</p>
        </div>
        <button
          type="button"
          onClick={() => setEditingId('new')}
          className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={14} /> Onboard a flat
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load flats.
        </p>
      )}

      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(flat) => flat.id}
          emptyMessage="No flats yet — onboard one above."
        />
      )}
    </div>
  );
}
