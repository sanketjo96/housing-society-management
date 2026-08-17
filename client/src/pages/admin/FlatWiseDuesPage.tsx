import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { authedFetch } from '../../lib/api';
import type { ResidentSummary } from '../../types';

interface FlatDues {
  flat: { id: string; wing: string; flatNumber: string };
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
  paidTotal: number;
  outstandingTotal: number;
  creditTotal: number;
}

async function fetchFlatDues(): Promise<FlatDues[]> {
  const res = await authedFetch('/api/admin/dashboard/flat-dues');
  if (!res.ok) throw new Error('Could not load flat-wise dues.');
  return res.json();
}

// Admin-only page (App.tsx: /flat-dues, allowedRoles ADMIN) — reached only via the
// "Maintenance Outstanding Total" tile on AdminDashboardPage, not a sidebar nav item,
// since it's a drill-down of that one figure rather than a destination of its own.
export function FlatWiseDuesPage() {
  const duesQuery = useQuery({ queryKey: ['admin-dashboard-flat-dues'], queryFn: fetchFlatDues });

  const duesColumns = useMemo<ColumnDef<FlatDues, unknown>[]>(
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
        id: 'outstanding',
        header: 'Outstanding',
        accessorFn: (row) => row.outstandingTotal,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span
            className={`font-mono-brand ${row.original.outstandingTotal > 0 ? 'text-coral' : 'text-ink'}`}
          >
            ₹{row.original.outstandingTotal.toLocaleString('en-IN')}
          </span>
        ),
      },
      // 'Paid' column (row.paidTotal) hidden for now — FlatDues still returns
      // paidTotal, only this column definition was removed.
      {
        id: 'credit',
        header: 'Credit',
        accessorFn: (row) => row.creditTotal,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className={`font-mono-brand ${row.original.creditTotal > 0 ? 'text-teal' : 'text-muted'}`}>
            ₹{row.original.creditTotal.toLocaleString('en-IN')}
          </span>
        ),
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
        <h1 className="m-0 font-display text-xl text-ink">Flat-wise dues</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">{duesQuery.data?.length ?? 0} flats</p>
      </div>

      {duesQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {duesQuery.isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load flat-wise dues.
        </p>
      )}

      {duesQuery.data && (
        <DataTable
          data={duesQuery.data}
          columns={duesColumns}
          getRowId={(d) => d.flat.id}
          emptyMessage="No flats yet."
        />
      )}
    </div>
  );
}
