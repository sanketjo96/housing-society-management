import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/DataTable';
import { authedFetch } from '../../lib/api';
import type { ResidentSummary } from '../../types';

interface FlatSummary {
  id: string;
  wing: string;
  flatNumber: string;
  currentTenant: ResidentSummary | null;
}

interface TenantRow {
  flat: { id: string; wing: string; flatNumber: string };
  tenant: ResidentSummary;
}

async function fetchFlats(): Promise<FlatSummary[]> {
  const res = await authedFetch('/api/admin/flats');
  if (!res.ok) throw new Error('Could not load flats.');
  return res.json();
}

// Admin-only page (App.tsx: /tenants, allowedRoles ADMIN) — reached only via the
// "Total Tenants" tile on AdminDashboardPage, not a sidebar nav item, same pattern as
// FlatWiseDuesPage. Lists only tenant information (flat + tenant contact details) —
// owner-occupied flats and flat/onboarding management stay on /flats.
export function TenantsListPage() {
  const flatsQuery = useQuery({ queryKey: ['admin-flats'], queryFn: fetchFlats });

  const tenantRows = useMemo<TenantRow[]>(
    () =>
      (flatsQuery.data ?? [])
        .filter((flat): flat is FlatSummary & { currentTenant: ResidentSummary } => flat.currentTenant !== null)
        .map((flat) => ({
          flat: { id: flat.id, wing: flat.wing, flatNumber: flat.flatNumber },
          tenant: flat.currentTenant,
        })),
    [flatsQuery.data],
  );

  const columns = useMemo<ColumnDef<TenantRow, unknown>[]>(
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
        id: 'name',
        header: 'Tenant',
        accessorFn: (row) => row.tenant.name,
        cell: ({ row }) => <span className="text-ink">{row.original.tenant.name}</span>,
      },
      {
        id: 'email',
        header: 'Email',
        accessorFn: (row) => row.tenant.email,
      },
      {
        id: 'phone',
        header: 'Phone',
        cell: ({ row }) => <span>{row.original.tenant.phone ?? '—'}</span>,
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
        <h1 className="m-0 font-display text-xl text-ink">Tenants</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">{tenantRows.length} tenant-occupied flats</p>
      </div>

      {flatsQuery.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {flatsQuery.isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load tenants.
        </p>
      )}

      {flatsQuery.data && (
        <DataTable
          data={tenantRows}
          columns={columns}
          getRowId={(row) => row.flat.id}
          emptyMessage="No tenant-occupied flats right now."
        />
      )}
    </div>
  );
}
