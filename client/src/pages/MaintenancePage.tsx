import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Check, QrCode, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { ErrorBanner } from '../components/FormField';
import { authedFetch } from '../lib/api';

interface MaintenanceRecord {
  id: string;
  period: string;
  payerType: 'OWNER' | 'TENANT';
  amount: string;
  status: 'UNPAID' | 'PENDING_REVIEW' | 'PAID';
  dueDate: string;
  flat: { id: string; wing: string; flatNumber: string };
}

interface QrResult {
  amount: number;
  upiLink: string;
  qrDataUrl: string;
}

async function fetchMyRecords(): Promise<MaintenanceRecord[]> {
  const res = await authedFetch('/api/me/maintenance-records');
  if (!res.ok) throw new Error('Could not load your maintenance records.');
  return res.json();
}

const STATUS_META: Record<MaintenanceRecord['status'], { className: string; label: string }> = {
  UNPAID: { className: 'bg-[#EEF1EC] text-muted', label: 'Unpaid' },
  PENDING_REVIEW: { className: 'bg-amber-light text-brass', label: 'Pending review' },
  PAID: { className: 'bg-teal-light text-teal', label: 'Paid' },
};

function StatusBadge({ status }: { status: MaintenanceRecord['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

// Task 6.8's "select a subset, see a QR, pay, upload proof" flow, shown once the
// resident has selected at least one UNPAID record and clicked "Pay selected".
function PaymentPanel({
  selectedIds,
  selectedRecords,
  onDone,
}: {
  selectedIds: string[];
  selectedRecords: MaintenanceRecord[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const qrQuery = useQuery({
    queryKey: ['payment-qr', selectedIds],
    queryFn: async (): Promise<QrResult> => {
      const res = await authedFetch('/api/me/maintenance-records/qr', {
        method: 'POST',
        body: JSON.stringify({ maintenanceRecordIds: selectedIds }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not generate the payment QR.');
      return body;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Choose a screenshot or PDF of your payment first.');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('maintenanceRecordIds', JSON.stringify(selectedIds));
      const res = await authedFetch('/api/me/payment-proofs', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not submit your payment proof.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-maintenance-records'] });
      onDone();
    },
  });

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setFileName(selected?.name ?? null);
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <button
        type="button"
        onClick={onDone}
        className="mb-4 flex items-center gap-1.5 border-none bg-transparent p-0 text-xs text-muted"
      >
        <ArrowLeft size={13} /> Back to passbook
      </button>

      <h2 className="m-0 mb-1 font-display text-lg text-ink">Pay {selectedRecords.length} record(s)</h2>
      <p className="m-0 mb-4 text-xs text-muted">
        {selectedRecords.map((r) => periodLabel(r.period)).join(', ')}
      </p>

      {qrQuery.isLoading && <p className="text-sm text-muted">Generating QR…</p>}
      {qrQuery.isError && <ErrorBanner>{(qrQuery.error as Error).message}</ErrorBanner>}

      {qrQuery.data && (
        <>
          <div className="mb-5 flex flex-col items-center rounded-xl border border-line bg-paper p-5">
            <p className="m-0 mb-3 font-mono-brand text-2xl font-semibold text-ink">
              ₹{qrQuery.data.amount.toLocaleString('en-IN')}
            </p>
            <img src={qrQuery.data.qrDataUrl} alt="UPI payment QR code" className="h-48 w-48" />
            <a
              href={qrQuery.data.upiLink}
              className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-teal"
            >
              <QrCode size={14} /> Open in a UPI app
            </a>
          </div>

          <p className="m-0 mb-2 text-xs font-semibold text-muted">
            After paying, upload a screenshot or PDF of your payment as proof
          </p>
          <div className="mb-4 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              aria-label="Upload payment proof"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
            >
              <Upload size={13} /> Choose file
            </button>
            {fileName && <span className="text-xs text-muted">{fileName}</span>}
          </div>

          {uploadMutation.error && <ErrorBanner>{(uploadMutation.error as Error).message}</ErrorBanner>}

          <button
            type="button"
            onClick={() => uploadMutation.mutate()}
            disabled={!file || uploadMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
          >
            {uploadMutation.isPending ? 'Submitting…' : 'Submit proof'}
          </button>
        </>
      )}
    </div>
  );
}

export function MaintenancePage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-maintenance-records'], queryFn: fetchMyRecords });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);

  const unpaid = data?.filter((r) => r.status === 'UNPAID') ?? [];
  const outstanding = unpaid.reduce((sum, r) => sum + Number(r.amount), 0);
  const selectedRecords = unpaid.filter((r) => selected.has(r.id));
  const selectedTotal = selectedRecords.reduce((sum, r) => sum + Number(r.amount), 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function donePaying() {
    setPaying(false);
    setSelected(new Set());
  }

  const columns = useMemo<ColumnDef<MaintenanceRecord, unknown>[]>(
    () => [
      {
        id: 'select',
        header: '',
        meta: { cellClassName: 'w-8' },
        cell: ({ row }) =>
          row.original.status === 'UNPAID' && (
            <input
              type="checkbox"
              aria-label={`Select ${periodLabel(row.original.period)} for payment`}
              checked={selected.has(row.original.id)}
              onChange={() => toggle(row.original.id)}
            />
          ),
      },
      {
        id: 'period',
        header: 'Period',
        cell: ({ row }) => <span className="font-mono-brand text-ink">{periodLabel(row.original.period)}</span>,
      },
      {
        id: 'payer',
        header: 'Payer',
        cell: ({ row }) => (
          <span className="text-muted">{row.original.payerType === 'OWNER' ? 'Owner' : 'Tenant'}</span>
        ),
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
        id: 'status',
        header: 'Status',
        meta: { align: 'right' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ],
    [selected],
  );

  if (paying) {
    return (
      <div className="mx-auto max-w-2xl">
        <PaymentPanel selectedIds={[...selected]} selectedRecords={selectedRecords} onDone={donePaying} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Maintenance passbook</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your maintenance records.
        </p>
      )}

      {data && (
        <>
          <div className="mb-5 rounded-2xl border border-line bg-white p-5">
            <p className="m-0 text-xs uppercase tracking-wide text-muted">Total outstanding</p>
            <p
              data-testid="outstanding-total"
              className="m-0 mt-1 font-mono-brand text-3xl font-semibold text-ink"
            >
              ₹{outstanding.toLocaleString('en-IN')}
            </p>
            {outstanding === 0 && (
              <p className="m-0 mt-2 flex items-center gap-1.5 text-sm text-teal">
                <Check size={14} /> All settled
              </p>
            )}
          </div>

          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            emptyMessage="No maintenance records yet."
          />

          {selected.size > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-white p-4">
              <p className="m-0 text-sm text-ink">
                {selected.size} selected · <span className="font-mono-brand">₹{selectedTotal.toLocaleString('en-IN')}</span>
              </p>
              <button
                type="button"
                onClick={() => setPaying(true)}
                className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
              >
                <QrCode size={14} /> Pay selected
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
