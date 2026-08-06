import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { authedFetch } from '../lib/api';

interface MaintenanceRecord {
  id: string;
  period: string;
  payerType: 'OWNER' | 'TENANT';
  amount: string;
  status: 'UNPAID' | 'PENDING_REVIEW' | 'PAID';
  dueDate: string;
  flat: { id: string; block: string; flatNumber: string };
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

export function MaintenancePage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['my-maintenance-records'], queryFn: fetchMyRecords });

  const outstanding = data?.filter((r) => r.status === 'UNPAID').reduce((sum, r) => sum + Number(r.amount), 0) ?? 0;

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

          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Period</th>
                  <th className="px-4 py-3 font-semibold">Payer</th>
                  <th className="px-4 py-3 text-right font-semibold">Amount</th>
                  <th className="px-4 py-3 text-right font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono-brand text-ink">{periodLabel(r.period)}</td>
                    <td className="px-4 py-3 text-muted">{r.payerType === 'OWNER' ? 'Owner' : 'Tenant'}</td>
                    <td className="px-4 py-3 text-right font-mono-brand text-ink">
                      ₹{Number(r.amount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
                {data.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                      No maintenance records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted">
            Payment (QR code, proof upload) isn&apos;t available yet — coming in a later phase.
          </p>
        </>
      )}
    </div>
  );
}
