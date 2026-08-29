import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import { useMemo } from 'react';
import { DataTable } from '../../components/data-table/DataTable';
import { authedFetch } from '../../lib/api';
import { downloadAuthedFile } from '../../lib/download-file';

type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH';
type ComplaintStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

interface ComplaintListItem {
  id: string;
  title: string;
  possibleSolution: string;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  createdAt: string;
  hasImage: boolean;
  upvoteCount: number;
  owner: { id: string; name: string };
  flat: { wing: string; flatNumber: string };
}

const PRIORITY_META: Record<ComplaintPriority, { className: string; label: string }> = {
  LOW: { className: 'border border-line text-ink', label: 'Low' },
  MEDIUM: { className: 'border border-teal text-teal', label: 'Medium' },
  HIGH: { className: 'border border-coral text-coral', label: 'High' },
};

function PriorityBadge({ priority }: { priority: ComplaintPriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

const STATUS_OPTIONS: { value: ComplaintStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REJECTED', label: 'Rejected' },
];

async function fetchComplaints(): Promise<ComplaintListItem[]> {
  const res = await authedFetch('/api/complaints');
  if (!res.ok) throw new Error('Could not load complaints.');
  return res.json();
}

// No transition guard here on purpose — the backend allows any status to any
// other status at any time (docs/features/complaints/01-requirements.md
// Confirmed Product Decision #5), so every option is always selectable,
// including reverting a Resolved complaint back to Open.
function StatusSelect({ complaint }: { complaint: ComplaintListItem }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (status: ComplaintStatus) => {
      const res = await authedFetch(`/api/admin/complaints/${complaint.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not update this complaint.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-complaints'] }),
  });

  return (
    <div>
      <select
        value={complaint.status}
        onChange={(e) => mutation.mutate(e.target.value as ComplaintStatus)}
        disabled={mutation.isPending}
        aria-label={`Status for ${complaint.title}`}
        className="rounded-md border border-line px-2 py-1.5 text-xs font-semibold text-ink disabled:opacity-70"
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {mutation.error && (
        <p className="mt-1 text-xs text-coral">{(mutation.error as Error).message}</p>
      )}
    </div>
  );
}

function ImageCell({ complaint }: { complaint: ComplaintListItem }) {
  if (!complaint.hasImage) return <span className="text-xs text-muted">No image</span>;

  return (
    <button
      type="button"
      onClick={() => {
        downloadAuthedFile(
          `/api/complaints/${complaint.id}/image`,
          'Could not load the complaint image.',
        ).catch(() => {
          // Errors from a background image view aren't worth a dedicated
          // inline slot on this dense a table — same tradeoff PaymentProofsPage
          // doesn't make either for its equivalent action.
        });
      }}
      className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
    >
      <Eye size={13} /> View image
    </button>
  );
}

export function AdminComplaintsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-complaints'],
    queryFn: fetchComplaints,
  });

  const columns = useMemo<ColumnDef<ComplaintListItem, unknown>[]>(
    () => [
      {
        id: 'complaint',
        header: 'Complaint',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.title}
            <div className="text-xs text-muted">{row.original.possibleSolution}</div>
          </span>
        ),
      },
      {
        id: 'raisedBy',
        header: 'Raised by',
        meta: { headerClassName: 'w-36', cellClassName: 'w-36 max-w-36' },
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.flat.wing}-{row.original.flat.flatNumber}
            <div className="text-xs text-muted">{row.original.owner.name}</div>
          </span>
        ),
      },
      {
        id: 'priority',
        header: 'Priority',
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'upvotes',
        header: 'Upvotes',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-mono-brand text-ink">{row.original.upvoteCount}</span>,
      },
      {
        id: 'image',
        header: 'Image',
        cell: ({ row }) => <ImageCell complaint={row.original} />,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusSelect complaint={row.original} />,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Complaints</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">{data?.length ?? 0} complaints</p>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load complaints.
        </p>
      )}

      {data && (
        <DataTable data={data} columns={columns} getRowId={(c) => c.id} emptyMessage="No complaints." />
      )}
    </div>
  );
}
