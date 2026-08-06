import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, FileSpreadsheet, Home, Plus, Save, Upload, User, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Divider, ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../../components/FormField';
import { authedFetch } from '../../lib/api';
import type { ResidentSummary } from '../../types';
import { fetchSettings } from './SettingsPage';

interface FlatSummary {
  id: string;
  wing: string;
  flatNumber: string;
  baseRate: string;
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
}

interface ImportResult {
  created: unknown[];
  errors: { row: number; message: string }[];
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

  // New flats are pre-filled from the admin Settings tab's default base rate
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
      <div className="grid grid-cols-2 gap-3.5">
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

      <SectionHeader icon={User} title="Owner details" />
      <Field label="Full name">
        <input
          aria-label="Owner's full name"
          className={inputClass}
          placeholder="Owner's full name"
          {...register('ownerName')}
        />
        {errors.ownerName && <ErrMsg>{errors.ownerName.message}</ErrMsg>}
      </Field>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Phone">
          <input
            aria-label="Owner's phone"
            className={inputClass}
            placeholder="+91 XXXXX XXXXX"
            {...register('ownerPhone')}
          />
        </Field>
        <Field label="Email">
          <input
            aria-label="Owner's email"
            type="email"
            className={inputClass}
            placeholder="owner@example.com"
            {...register('ownerEmail')}
          />
          {errors.ownerEmail && <ErrMsg>{errors.ownerEmail.message}</ErrMsg>}
        </Field>
      </div>

      <Divider />

      <SectionHeader icon={Users} title="Occupancy" />
      <div className="mb-4 flex gap-2" role="group" aria-label="Occupancy">
        {(
          [
            { key: 'owner' as const, label: 'Owner-occupied · 1x rate' },
            { key: 'tenant' as const, label: 'Tenant-occupied · 1.5x rate' },
          ]
        ).map((opt) => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={occupancy === opt.key}
            onClick={() => setValue('occupancy', opt.key)}
            className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold ${
              occupancy === opt.key ? 'border-teal bg-teal-light text-teal' : 'border-line bg-white text-ink'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {occupancy === 'tenant' && (
        <div className="rounded-lg border border-line bg-paper p-4">
          <p className="m-0 mb-3 text-xs font-semibold text-muted">Tenant details</p>
          <Field label="Full name">
            <input
              aria-label="Tenant's full name"
              className={inputClass}
              placeholder="Tenant's full name"
              {...register('tenantName')}
            />
            {errors.tenantName && <ErrMsg>{errors.tenantName.message}</ErrMsg>}
          </Field>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Phone">
              <input
                aria-label="Tenant's phone"
                className={inputClass}
                placeholder="+91 XXXXX XXXXX"
                {...register('tenantPhone')}
              />
            </Field>
            <Field label="Email">
              <input
                aria-label="Tenant's email"
                type="email"
                className={inputClass}
                placeholder="tenant@example.com"
                {...register('tenantEmail')}
              />
              {errors.tenantEmail && <ErrMsg>{errors.tenantEmail.message}</ErrMsg>}
            </Field>
          </div>
          <Field label="Effective from">
            <input type="date" className={inputClass} {...register('effectiveFrom')} />
          </Field>
          <p className="m-0 text-xs text-muted">
            Used to calculate correct maintenance rates if occupancy changes mid-month.
          </p>
        </div>
      )}

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

// Header + one worked example row — used both as the downloadable template's content
// and as the source of the column list shown in the panel's description.
const CSV_TEMPLATE =
  'wing,flatNumber,baseRate,ownerName,ownerEmail,occupancy,tenantName,tenantEmail\n' +
  'A,101,2000,Priya Nair,priya@example.com,owner,,\n';

function downloadCsvTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'flats-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function CsvImportPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Takes the file's raw text as the mutation variable (not component state) — no
  // textarea to hold it in; the backend still parses CSV text server-side
  // (src/services/flats.service.ts's bulkImportFlats), only how that text reaches the
  // request body changed, from "typed into a textarea" to "read from an uploaded file".
  const mutation = useMutation<ImportResult, Error, string>({
    mutationFn: async (csv) => {
      const res = await authedFetch('/api/admin/flats/import', {
        method: 'POST',
        body: JSON.stringify({ csv }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Import failed.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-flats'] }),
  });

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file (e.g. re-import after fixing errors)
    if (!file) return;
    mutation.mutate(await file.text());
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 mb-1.5 font-display text-base text-ink">Bulk import (CSV)</h2>
          <p className="m-0 text-xs text-muted">
            Columns: wing, flatNumber, baseRate, ownerName, ownerEmail, plus optional ownerPhone,
            occupancy (owner/tenant), tenantName, tenantPhone, tenantEmail, effectiveFrom.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={downloadCsvTemplate}
            className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
          >
            <FileSpreadsheet size={13} /> Download template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            aria-label="Upload CSV file"
            onChange={(e) => void handleFileSelected(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            <Upload size={13} /> {mutation.isPending ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </div>

      {mutation.isSuccess && mutation.data && (
        <p className="mt-3 text-xs text-teal">{mutation.data.created.length} flat(s) created.</p>
      )}
      {mutation.isSuccess && mutation.data && mutation.data.errors.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-coral">
          {mutation.data.errors.map((e) => (
            <li key={e.row}>
              Row {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}
      {mutation.error && <p className="mt-2 text-xs text-coral">{mutation.error.message}</p>}
    </div>
  );
}

function occupancyLabel(flat: FlatSummary) {
  return flat.currentTenant ? 'Tenant' : 'Owner';
}

export function FlatsListPage() {
  const [editingId, setEditingId] = useState<string | null | 'new'>(null);
  const { data, isLoading, isError } = useQuery({ queryKey: ['admin-flats'], queryFn: fetchFlats });
  // Fetched here too (not just on the Settings tab) so a new flat's base rate can be
  // pre-filled even if the admin never opens Settings this session.
  const { data: settings } = useQuery({ queryKey: ['society-settings'], queryFn: fetchSettings });

  if (editingId === 'new') {
    return (
      <div className="mx-auto max-w-2xl">
        <FlatForm defaultBaseRate={settings?.defaultBaseRate} onDone={() => setEditingId(null)} />
      </div>
    );
  }

  const editingFlat = data?.find((f) => f.id === editingId);
  if (editingFlat) {
    return (
      <div className="mx-auto max-w-2xl">
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

      <CsvImportPanel />

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load flats.
        </p>
      )}

      {data && (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Flat</th>
                <th className="px-4 py-3 font-semibold">Owner</th>
                <th className="px-4 py-3 font-semibold">Occupancy</th>
                <th className="px-4 py-3 font-semibold">Tenant</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((flat) => (
                <tr key={flat.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-mono-brand text-ink">
                    {flat.wing}-{flat.flatNumber}
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {flat.owner.name}
                    <div className="text-xs text-muted">{flat.owner.email}</div>
                  </td>
                  <td className="px-4 py-3 text-muted">{occupancyLabel(flat)}</td>
                  <td className="px-4 py-3 text-ink">
                    {flat.currentTenant ? (
                      <>
                        {flat.currentTenant.name}
                        <div className="text-xs text-muted">{flat.currentTenant.email}</div>
                      </>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(flat.id)}
                      className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-muted">
                    No flats yet — onboard one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
