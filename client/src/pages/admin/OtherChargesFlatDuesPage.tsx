import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { authedFetch } from '../../lib/api';

type SettlementStatus = 'UNPAID' | 'PARTIALLY_SETTLED' | 'PAID';

interface OtherChargeListItem {
  id: string;
  amount: string;
  note: string | null;
  settlementStatus: SettlementStatus;
  settledAmount: number;
  payer: { id: string; name: string; email: string };
  flat: { id: string; wing: string; flatNumber: string };
  feeType: { id: string; name: string };
}

interface OtherChargeDueRow {
  id: string;
  flat: { wing: string; flatNumber: string };
  payerName: string;
  feeTypeName: string;
  note: string | null;
  outstanding: number;
  settledAmount: number;
  amount: number;
  settlementStatus: SettlementStatus;
}

// Reuses GET /api/admin/other-charges (the same list OtherChargesPage.tsx's "Bill a
// Charge" page shows) rather than a flat-wise aggregate — a fee-type breakdown only
// makes sense per charge, not per flat, since one flat can owe several different fee
// types at once. Filtered to only what's still owed (UNPAID/PARTIALLY_SETTLED) — a
// fully PAID charge isn't a "due" — and sorted by Outstanding descending, same
// highest-owed-first convention as FlatWiseDuesPage.tsx. There is no Credit column
// here, deliberately: Credit only ever exists against the Maintenance pool
// (createCredit has no category param) — it can never apply to an Other Charge.
async function fetchOtherChargesDues(): Promise<OtherChargeDueRow[]> {
  const res = await authedFetch('/api/admin/other-charges');
  if (!res.ok) throw new Error('Could not load other charges dues.');
  const charges: OtherChargeListItem[] = await res.json();
  return charges
    .filter((c) => c.settlementStatus !== 'PAID')
    .map((c) => ({
      id: c.id,
      flat: c.flat,
      payerName: c.payer.name,
      feeTypeName: c.feeType.name,
      note: c.note,
      amount: Number(c.amount),
      settledAmount: c.settledAmount,
      outstanding: Number(c.amount) - c.settledAmount,
      settlementStatus: c.settlementStatus,
    }))
    .sort((a, b) => b.outstanding - a.outstanding);
}

const STATUS_META: Record<SettlementStatus, { className: string; label: string }> = {
  PAID: { className: 'bg-teal-light text-teal', label: 'Paid' },
  PARTIALLY_SETTLED: { className: 'bg-amber-light text-brass', label: 'Partially settled' },
  UNPAID: { className: 'bg-coral-light text-coral', label: 'Unpaid' },
};

function SettlementBadge({ row }: { row: OtherChargeDueRow }) {
  const meta = STATUS_META[row.settlementStatus];
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
        {meta.label}
      </span>
      {row.settlementStatus === 'PARTIALLY_SETTLED' && (
        <span className="font-mono-brand text-[11px] text-muted">
          ₹{row.settledAmount.toLocaleString('en-IN')} of ₹{row.amount.toLocaleString('en-IN')}
        </span>
      )}
    </div>
  );
}

// Admin-only page (App.tsx: /other-charges-dues, allowedRoles ADMIN) — reached only
// via the "Other Charges Outstanding Total" tile on AdminDashboardPage, not a
// sidebar nav item, same drill-down convention as /flat-dues. Deliberately a
// separate, read-only URL from /other-charges (the "Custom Bills" billing action,
// sidebar item) — this page never links to billing.
export function OtherChargesFlatDuesPage() {
  const duesQuery = useQuery({ queryKey: ['admin-other-charges-dues'], queryFn: fetchOtherChargesDues });

  const duesColumns = useMemo<ColumnDef<OtherChargeDueRow, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        accessorFn: (row) => `${row.flat.wing}-${row.flat.flatNumber}`,
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
            <div className="font-sans text-xs text-muted">{row.original.payerName}</div>
          </span>
        ),
      },
      {
        id: 'feeType',
        header: 'Fee type',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.feeTypeName}
            {row.original.note && <div className="text-xs text-muted">{row.original.note}</div>}
          </span>
        ),
      },
      {
        id: 'outstanding',
        header: 'Outstanding',
        accessorFn: (row) => row.outstanding,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono-brand text-coral">₹{row.original.outstanding.toLocaleString('en-IN')}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { align: 'right' },
        cell: ({ row }) => <SettlementBadge row={row.original} />,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-teal">
        <ArrowLeft size={13} /> Back to dashboard
      </Link>

      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Other charges dues</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">{duesQuery.data?.length ?? 0} outstanding charges</p>
      </div>

      {duesQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {duesQuery.isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load other charges dues.
        </p>
      )}

      {duesQuery.data && (
        <DataTable
          data={duesQuery.data}
          columns={duesColumns}
          getRowId={(d) => d.id}
          emptyMessage="Nothing outstanding — every billed charge is fully settled."
        />
      )}
    </div>
  );
}
