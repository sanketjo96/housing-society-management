import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { SummaryCard } from '../_shared/components/ledger-entry-display/LedgerEntryDisplay';
import { authedFetch } from '../../lib/api';

interface BalancesSummary {
  maintenance: { outstanding: number; availableCredit: number };
  otherCharges: { outstanding: number };
  totalOutstanding: number;
}

async function fetchMyBalances(): Promise<BalancesSummary> {
  const res = await authedFetch('/api/me/balances');
  if (!res.ok) throw new Error('Could not load your balances.');
  return res.json();
}

// Pure navigation hub: 4 summary cards, one per balance pool. Maintenance
// Outstanding and Available Credit link to /maintenance-book (where Pay lives),
// Other Outstanding to /other-charges-book. Total Outstanding has no drill-down —
// it's the sum of the other two.
export function ResidentDashboardOverview() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-balances'], queryFn: fetchMyBalances });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="m-0 mb-6 font-display text-xl text-ink">Dashboard</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your dashboard.
        </p>
      )}

      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4">
            <SummaryCard
              label="Total Outstanding"
              value={data.totalOutstanding}
              accent={data.totalOutstanding > 0 ? 'coral' : undefined}
            />
            <SummaryCard
              label="Maintenance Outstanding"
              value={data.maintenance.outstanding}
              accent={data.maintenance.outstanding > 0 ? 'coral' : undefined}
              to="/maintenance-book"
            />
            <SummaryCard
              label="Other Outstanding"
              value={data.otherCharges.outstanding}
              accent={data.otherCharges.outstanding > 0 ? 'coral' : undefined}
              to="/other-charges-book"
            />
            <SummaryCard
              label="Available Maintenance Credit"
              value={data.maintenance.availableCredit}
              accent={data.maintenance.availableCredit > 0 ? 'teal' : undefined}
              to="/maintenance-book"
            />
          </div>

          {data.totalOutstanding === 0 && (
            <p className="m-0 flex items-center gap-1.5 text-sm font-semibold text-teal">
              <CheckCircle2 size={16} /> Nothing outstanding right now
            </p>
          )}
        </>
      )}
    </div>
  );
}
