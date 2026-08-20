import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DataTable } from '../../components/DataTable';
import { authedFetch } from '../../lib/api';
import type { ResidentSummary } from '../../types';

interface ResidentLedgerRow {
  flat: { id: string; wing: string; flatNumber: string };
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
  outstandingMaintenance: number;
  paidMaintenance: number;
  creditMaintenance: number;
  outstandingOtherCharges: number;
}

async function fetchResidentLedger(): Promise<ResidentLedgerRow[]> {
  const res = await authedFetch('/api/admin/dashboard/resident-ledger');
  if (!res.ok) throw new Error('Could not load the resident ledger.');
  return res.json();
}

function money(value: number, accent?: 'coral' | 'teal') {
  return (
    <span
      className={`font-mono-brand ${accent === 'coral' ? 'text-coral' : accent === 'teal' ? 'text-teal' : 'text-ink'}`}
    >
      ₹{value.toLocaleString('en-IN')}
    </span>
  );
}

// "Resident Book" — admin-only page (App.tsx: /resident-ledger,
// allowedRoles ADMIN), a sidebar nav item (unlike /flat-dues and
// /other-charges-dues, which are dashboard-card drill-downs filtered to only
// what's still owed). Lists every flat, both pools (Maintenance + Other Charges)
// combined in one row via GET /api/admin/dashboard/resident-ledger — a directory
// to browse the whole society's balances, not an exception list.
export function ResidentLedgerPage() {
  const ledgerQuery = useQuery({ queryKey: ['admin-resident-ledger'], queryFn: fetchResidentLedger });

  const columns = useMemo<ColumnDef<ResidentLedgerRow, unknown>[]>(
    () => [
      {
        id: 'flat',
        header: 'Flat',
        accessorFn: (row) => `${row.flat.wing}-${row.flat.flatNumber}`,
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
          </span>
        ),
      },
      {
        id: 'owner',
        header: 'Owner',
        accessorFn: (row) => row.owner.name,
        cell: ({ row }) => (
          <div>
            <span className="text-ink">{row.original.owner.name}</span>
            {row.original.currentTenant && (
              <p className="m-0 text-xs text-muted">Tenant: {row.original.currentTenant.name}</p>
            )}
          </div>
        ),
      },
      {
        id: 'outstandingMaintenance',
        header: 'Outstanding Maintenance',
        accessorFn: (row) => row.outstandingMaintenance,
        meta: { align: 'right' },
        cell: ({ row }) =>
          money(row.original.outstandingMaintenance, row.original.outstandingMaintenance > 0 ? 'coral' : undefined),
      },
      {
        id: 'paidMaintenance',
        header: 'Paid Maintenance',
        accessorFn: (row) => row.paidMaintenance,
        meta: { align: 'right' },
        cell: ({ row }) => money(row.original.paidMaintenance),
      },
      {
        id: 'creditMaintenance',
        header: 'Credit Maintenance',
        accessorFn: (row) => row.creditMaintenance,
        meta: { align: 'right' },
        cell: ({ row }) =>
          money(row.original.creditMaintenance, row.original.creditMaintenance > 0 ? 'teal' : undefined),
      },
      {
        id: 'outstandingOtherCharges',
        header: 'Outstanding Other Charge',
        accessorFn: (row) => row.outstandingOtherCharges,
        meta: { align: 'right' },
        cell: ({ row }) =>
          money(
            row.original.outstandingOtherCharges,
            row.original.outstandingOtherCharges > 0 ? 'coral' : undefined,
          ),
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Resident book</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">{ledgerQuery.data?.length ?? 0} flats</p>
      </div>

      {ledgerQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {ledgerQuery.isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load the resident ledger.
        </p>
      )}

      {ledgerQuery.data && (
        <DataTable
          data={ledgerQuery.data}
          columns={columns}
          getRowId={(d) => d.flat.id}
          emptyMessage="No flats yet."
        />
      )}
    </div>
  );
}
