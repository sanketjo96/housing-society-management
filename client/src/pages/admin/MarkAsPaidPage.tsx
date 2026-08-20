import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../../components/FormField';
import { LedgerCategoryBadge, type LedgerCategory } from '../../components/LedgerCategoryBadge';
import { authedFetch } from '../../lib/api';
import { downloadAuthedFile } from '../../lib/download-file';

interface MarkAsPaidEntry {
  id: string;
  amount: string;
  category: LedgerCategory;
  createdAt: string;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
}

interface FlatOption {
  id: string;
  wing: string;
  flatNumber: string;
  owner: { name: string };
}

async function fetchFlatOptions(): Promise<FlatOption[]> {
  const res = await authedFetch('/api/admin/flats');
  if (!res.ok) throw new Error('Could not load flats.');
  return res.json();
}

// createdByType=ADMIN is exactly a manualDeposit row — the payer is still whichever
// resident (owner, or the tenant for maintenance) the payment was recorded against,
// but the row was created by an admin, not submitted by the resident. Delinked from
// Payment Proofs (2026-08-20): that page's Pending/Approved tabs only ever show
// entries with an attached proof file, and a manualDeposit row never has one (it's
// recorded outside the app, no screenshot) — so these entries were never actually
// visible there. No status filter here either: manualDeposit always creates an
// already-APPROVED entry, so filtering by createdByType alone is sufficient.
async function fetchMarkAsPaidEntries(): Promise<MarkAsPaidEntry[]> {
  const res = await authedFetch('/api/admin/ledger-entries?createdByType=ADMIN');
  if (!res.ok) throw new Error('Could not load entries.');
  return res.json();
}

// The admin fallback for a payment that never went through the UPI flow — cash
// handed to the treasurer, or a bank transfer done outside the app. Creates an
// already-APPROVED Deposit directly (manualDeposit, admin-ledger-service.ts) and
// issues a real receipt — there's no screenshot to review, so no PENDING step.
function MarkAsPaidForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [flatId, setFlatId] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<LedgerCategory>('MAINTENANCE');

  const { data: flats, isLoading: flatsLoading } = useQuery({
    queryKey: ['admin-flats-options'],
    queryFn: fetchFlatOptions,
  });

  const parsedAmount = Number(amount);
  const isAmountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;

  const submitMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch('/api/admin/ledger-entries/manual-deposit', {
        method: 'POST',
        body: JSON.stringify({ flatId, amount: parsedAmount, category }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not mark this payment as paid.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-mark-as-paid-entries'] });
      // manualDeposit also issues a real Receipt (admin-ledger-service.ts) —
      // without this, the Receipt Book page's cached list (30s staleTime,
      // App.tsx) can silently miss the one just issued.
      queryClient.invalidateQueries({ queryKey: ['admin-receipts'] });
      // Affects either pool's Outstanding depending on category — refresh the
      // dashboard cards (and, if this was an Other Charge, its own book/list) so
      // neither goes stale for the rest of the 30s window.
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admin-other-charges'] });
      onDone();
    },
  });

  return (
    <div className="mb-6 max-w-md rounded-xl border border-line p-5">
      <h2 className="m-0 mb-4 font-display text-base text-ink">Mark as paid</h2>
      <p className="m-0 mb-4 text-xs text-muted">
        For a payment received outside the app — cash or a direct bank transfer.
      </p>

      <Field label="Flat">
        <select
          value={flatId}
          onChange={(e) => setFlatId(e.target.value)}
          disabled={flatsLoading}
          className={inputClass}
        >
          <option value="">Select a flat…</option>
          {flats?.map((flat) => (
            <option key={flat.id} value={flat.id}>
              {flat.wing}-{flat.flatNumber} — {flat.owner.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min={0.01}
          step="0.01"
          className={inputClass}
        />
        {!isAmountValid && amount.length > 0 && <ErrMsg>Enter an amount greater than 0.</ErrMsg>}
      </Field>
      <Field label="Category">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as LedgerCategory)}
          className={inputClass}
        >
          <option value="MAINTENANCE">Maintenance</option>
          <option value="OTHER_CHARGE">Other Charge</option>
        </select>
      </Field>

      {submitMutation.error && <ErrorBanner>{submitMutation.error.message}</ErrorBanner>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending || !flatId || !isAmountValid}
          className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          {submitMutation.isPending ? 'Marking as paid…' : 'Mark as paid'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ReceiptDownloadCell({ entryId }: { entryId: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          downloadAuthedFile(`/api/ledger-entries/${entryId}/receipt`, 'No receipt was issued for this entry.').catch(
            (e: Error) => setError(e.message),
          );
        }}
        className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Download size={13} /> Download receipt
      </button>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </>
  );
}

export function MarkAsPaidPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-mark-as-paid-entries'],
    queryFn: fetchMarkAsPaidEntries,
  });

  const columns = useMemo<ColumnDef<MarkAsPaidEntry, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        meta: { headerClassName: 'w-36', cellClassName: 'w-36 max-w-36' },
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
            <div className="text-xs text-muted">{row.original.payer.name}</div>
          </span>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => <LedgerCategoryBadge category={row.original.category} />,
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">₹{Number(row.original.amount).toLocaleString('en-IN')}</span>
        ),
      },
      {
        id: 'recordedAt',
        header: 'Recorded',
        cell: ({ row }) => (
          <span className="text-xs text-muted">
            {new Date(row.original.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        ),
      },
      {
        id: 'receipt',
        header: 'Receipt',
        cell: ({ row }) => <ReceiptDownloadCell entryId={row.original.id} />,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-xl text-ink">Mark as paid</h1>
          <p className="m-0 mt-0.5 text-xs text-muted">
            Payments recorded directly by an admin — cash or a bank transfer done outside the app.
          </p>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 rounded-lg bg-teal px-3.5 py-2 text-xs font-semibold text-white"
          >
            <Plus size={14} /> Mark as paid
          </button>
        )}
      </div>

      {showForm && <MarkAsPaidForm onDone={() => setShowForm(false)} />}

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load entries.
        </p>
      )}

      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(e) => e.id}
          emptyMessage="No payments have been marked as paid yet."
        />
      )}
    </div>
  );
}
