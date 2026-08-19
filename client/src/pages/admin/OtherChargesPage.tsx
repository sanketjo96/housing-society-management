import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '../../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../../components/FormField';
import { authedFetch } from '../../lib/api';

type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

interface OtherChargeListItem {
  id: string;
  amount: string;
  note: string | null;
  dueDate: string;
  createdAt: string;
  settlementStatus: SettlementStatus;
  settledAmount: number;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
  feeType: { id: string; name: string };
  billedBy: { id: string; name: string };
}

interface FlatOption {
  id: string;
  wing: string;
  flatNumber: string;
  owner: { name: string };
}

interface FeeTypeOption {
  id: string;
  name: string;
}

async function fetchOtherCharges(): Promise<OtherChargeListItem[]> {
  const res = await authedFetch('/api/admin/other-charges');
  if (!res.ok) throw new Error('Could not load other charges.');
  return res.json();
}

async function fetchFlatOptions(): Promise<FlatOption[]> {
  const res = await authedFetch('/api/admin/flats');
  if (!res.ok) throw new Error('Could not load flats.');
  return res.json();
}

async function fetchActiveFeeTypes(): Promise<FeeTypeOption[]> {
  const res = await authedFetch('/api/admin/fee-types');
  if (!res.ok) throw new Error('Could not load fee types.');
  return res.json();
}

const STATUS_META: Record<SettlementStatus, { className: string; label: string }> = {
  PAID: { className: 'bg-teal-light text-teal', label: 'Paid' },
  PARTIALLY_SETTLED: { className: 'bg-amber-light text-brass', label: 'Partially settled' },
  UNPAID: { className: 'bg-coral-light text-coral', label: 'Unpaid' },
};

function SettlementBadge({ charge }: { charge: OtherChargeListItem }) {
  const meta = STATUS_META[charge.settlementStatus];
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
        {meta.label}
      </span>
      {charge.settlementStatus === 'PARTIALLY_SETTLED' && (
        <span className="font-mono-brand text-[11px] text-muted">
          ₹{charge.settledAmount.toLocaleString('en-IN')} of ₹{Number(charge.amount).toLocaleString('en-IN')}
        </span>
      )}
    </div>
  );
}

const billFormSchema = z.object({
  flatId: z.string().min(1, 'Flat is required'),
  feeTypeId: z.string().min(1, 'Fee type is required'),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  note: z.string().optional(),
});

type BillFormInput = z.input<typeof billFormSchema>;
type BillFormValues = z.infer<typeof billFormSchema>;

// One flat at a time — no bulk billing (docs/other-charges/, a confirmed scope
// decision). Same list<->form swap pattern as FlatsListPage.tsx.
function BillChargeForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const { data: flats, isLoading: flatsLoading } = useQuery({
    queryKey: ['admin-flats-options'],
    queryFn: fetchFlatOptions,
  });
  const { data: feeTypes, isLoading: feeTypesLoading } = useQuery({
    queryKey: ['admin-fee-types-active'],
    queryFn: fetchActiveFeeTypes,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<BillFormInput, unknown, BillFormValues>({ resolver: zodResolver(billFormSchema) });

  const mutation = useMutation<unknown, Error, BillFormValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/admin/other-charges', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not bill this charge.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-other-charges'] });
      // Both dashboard summary figures depend on Other Charges totals — refresh
      // them immediately rather than waiting out the 30s staleTime.
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] });
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

      <h1 className="m-0 mb-4 font-display text-lg text-ink">Bill a charge</h1>

      <Field label="Flat">
        <select disabled={flatsLoading} className={inputClass} {...register('flatId')}>
          <option value="">Select a flat…</option>
          {flats?.map((flat) => (
            <option key={flat.id} value={flat.id}>
              {flat.wing}-{flat.flatNumber} — {flat.owner.name}
            </option>
          ))}
        </select>
        {errors.flatId && <ErrMsg>{errors.flatId.message}</ErrMsg>}
      </Field>

      <Field label="Fee type">
        <select disabled={feeTypesLoading} className={inputClass} {...register('feeTypeId')}>
          <option value="">Select a fee type…</option>
          {feeTypes?.map((feeType) => (
            <option key={feeType.id} value={feeType.id}>
              {feeType.name}
            </option>
          ))}
        </select>
        {errors.feeTypeId && <ErrMsg>{errors.feeTypeId.message}</ErrMsg>}
      </Field>

      <Field label="Amount">
        <input type="number" step="0.01" className={inputClass} {...register('amount')} />
        {errors.amount && <ErrMsg>{errors.amount.message}</ErrMsg>}
      </Field>

      <Field label="Note (optional)">
        <textarea rows={2} className={inputClass} {...register('note')} />
      </Field>

      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-2 flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        <Save size={14} /> {mutation.isPending ? 'Billing…' : 'Bill this charge'}
      </button>
    </form>
  );
}

export function OtherChargesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-other-charges'],
    queryFn: fetchOtherCharges,
  });

  const columns = useMemo<ColumnDef<OtherChargeListItem, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
            <div className="text-xs text-muted">{row.original.payer.name}</div>
          </span>
        ),
      },
      {
        id: 'feeType',
        header: 'Fee type',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.feeType.name}
            {row.original.note && <div className="text-xs text-muted">{row.original.note}</div>}
          </span>
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            ₹{Number(row.original.amount).toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        id: 'date',
        header: 'Billed on',
        cell: ({ row }) => (
          <span className="text-ink">
            {new Date(row.original.createdAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { align: 'right' },
        cell: ({ row }) => <SettlementBadge charge={row.original} />,
      },
    ],
    [],
  );

  if (showForm) {
    return (
      <div className="mx-auto max-w-4xl">
        <BillChargeForm onDone={() => setShowForm(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-xl text-ink">Other charges</h1>
          <p className="m-0 mt-0.5 text-xs text-muted">{data?.length ?? 0} billed</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={14} /> Bill a charge
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load other charges.
        </p>
      )}

      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(c) => c.id}
          emptyMessage="No charges billed yet."
        />
      )}
    </div>
  );
}
