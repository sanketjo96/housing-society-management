import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUp, ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '../../components/data-table/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../../components/form-field/FormField';
import { FileUploadField } from '../../components/file-upload-field/FileUploadField';
import { useAuth } from '../../context/AuthContext';
import { authedFetch } from '../../lib/api';
import type { ComplaintListItem, ComplaintPriority, ComplaintStatus } from './types';

async function fetchComplaints(): Promise<ComplaintListItem[]> {
  const res = await authedFetch('/api/complaints');
  if (!res.ok) throw new Error('Could not load complaints.');
  return res.json();
}

// Authenticated endpoint — a plain <img src> can't carry the Bearer token,
// so fetch and hand off a blob: URL instead (same pattern as
// downloadReceipt in ledger-entry-display/LedgerEntryDisplay.tsx).
async function viewComplaintImage(id: string) {
  const res = await authedFetch(`/api/complaints/${id}/image`);
  if (!res.ok) throw new Error('Could not load this image.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const PRIORITY_META: Record<ComplaintPriority, { className: string; label: string }> = {
  LOW: { className: 'bg-paper text-muted', label: 'Low' },
  MEDIUM: { className: 'bg-amber-light text-brass', label: 'Medium' },
  HIGH: { className: 'bg-coral-light text-coral', label: 'High' },
};

const STATUS_META: Record<ComplaintStatus, { className: string; label: string }> = {
  OPEN: { className: 'bg-teal-light text-teal', label: 'Open' },
  IN_PROGRESS: { className: 'bg-amber-light text-brass', label: 'In Progress' },
  RESOLVED: { className: 'bg-paper text-muted', label: 'Resolved' },
  REJECTED: { className: 'bg-coral-light text-coral', label: 'Rejected' },
};

function Badge({ className, label }: { className: string; label: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>{label}</span>
  );
}

// A complaint the caller owns can be edited/deleted only while Open with
// zero upvotes — a live rule, re-enforced server-side on every request
// (see docs/features/complaints/01-requirements.md Confirmed Product
// Decision #7). This is a client-side convenience check only; the server
// is the source of truth and a stale 409 is handled at the call site.
function isEditableByMe(complaint: ComplaintListItem, myUserId: string | undefined): boolean {
  return complaint.owner.id === myUserId && complaint.status === 'OPEN' && complaint.upvoteCount === 0;
}

const complaintFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  possibleSolution: z.string().min(1, 'Possible solution is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

type ComplaintFormInput = z.input<typeof complaintFormSchema>;
type ComplaintFormValues = z.infer<typeof complaintFormSchema>;

function buildComplaintFormData(values: ComplaintFormValues, file: File | null): FormData {
  const formData = new FormData();
  formData.append('title', values.title);
  formData.append('possibleSolution', values.possibleSolution);
  formData.append('priority', values.priority);
  if (file) formData.append('file', file);
  return formData;
}

// Shared by both "log a new complaint" and "edit my complaint" — same
// fields, same optional image, different submit target.
function ComplaintForm({
  mode,
  initial,
  onDone,
  onCancel,
}: {
  mode: 'create' | 'edit';
  initial?: { id: string; title: string; possibleSolution: string; priority: ComplaintPriority };
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ComplaintFormInput, unknown, ComplaintFormValues>({
    resolver: zodResolver(complaintFormSchema),
    defaultValues: initial
      ? { title: initial.title, possibleSolution: initial.possibleSolution, priority: initial.priority }
      : { priority: 'LOW' },
  });

  const mutation = useMutation<unknown, Error, ComplaintFormValues>({
    mutationFn: async (values) => {
      const formData = buildComplaintFormData(values, file);
      const res = await authedFetch(
        mode === 'create' ? '/api/complaints' : `/api/complaints/${initial!.id}`,
        { method: mode === 'create' ? 'POST' : 'PATCH', body: formData },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) throw new Error('This complaint is no longer editable.');
        throw new Error(body?.error ?? 'Could not save this complaint.');
      }
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="mb-5 rounded-lg border border-line bg-white p-4"
    >
      {mutation.isError && <ErrorBanner>{mutation.error.message}</ErrorBanner>}
      <Field label="Title">
        <input className={inputClass} {...register('title')} />
        {errors.title && <ErrMsg>{errors.title.message}</ErrMsg>}
      </Field>
      <Field label="Possible solution">
        <textarea className={inputClass} rows={3} {...register('possibleSolution')} />
        {errors.possibleSolution && <ErrMsg>{errors.possibleSolution.message}</ErrMsg>}
      </Field>
      <Field label="Priority">
        <select className={inputClass} {...register('priority')}>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </Field>
      <Field label={mode === 'create' ? 'Photo (optional)' : 'Replace photo (optional)'}>
        <FileUploadField
          file={file}
          onFileChange={setFile}
          accept="image/jpeg,image/png,image/webp"
          placeholder="Attach a photo (optional)"
        />
      </Field>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-teal px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {mode === 'create' ? 'Log complaint' : 'Save changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function ComplaintsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['complaints'],
    queryFn: fetchComplaints,
  });

  const upvoteMutation = useMutation<unknown, Error, { id: string; nowUpvoted: boolean }>({
    mutationFn: async ({ id, nowUpvoted }) => {
      const res = await authedFetch(`/api/complaints/${id}/upvote`, {
        method: nowUpvoted ? 'POST' : 'DELETE',
      });
      if (!res.ok) throw new Error('Could not update your upvote.');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['complaints'] });
    },
    onError: (err) => setActionError(err.message),
  });

  const deleteMutation = useMutation<unknown, Error, string>({
    mutationFn: async (id) => {
      const res = await authedFetch(`/api/complaints/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        if (res.status === 409) throw new Error('This complaint is no longer editable.');
        throw new Error('Could not delete this complaint.');
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['complaints'] }),
    onError: (err) => setActionError(err.message),
  });

  const editingComplaint = data?.find((c) => c.id === editingId) ?? null;

  const columns: ColumnDef<ComplaintListItem, unknown>[] = [
    { id: 'title', header: 'Title', cell: ({ row }) => row.original.title },
    {
      id: 'flat',
      header: 'Flat',
      cell: ({ row }) => `${row.original.flat.wing}-${row.original.flat.flatNumber}`,
    },
    { id: 'owner', header: 'Raised by', cell: ({ row }) => row.original.owner.name },
    {
      id: 'priority',
      header: 'Priority',
      cell: ({ row }) => <Badge {...PRIORITY_META[row.original.priority]} />,
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <Badge {...STATUS_META[row.original.status]} />,
    },
    {
      id: 'image',
      header: 'Photo',
      cell: ({ row }) =>
        row.original.hasImage ? (
          <button
            type="button"
            onClick={() => void viewComplaintImage(row.original.id)}
            aria-label={`View photo for ${row.original.title}`}
            className="text-muted"
          >
            <ImageIcon size={16} />
          </button>
        ) : null,
    },
    {
      id: 'upvote',
      header: 'Upvotes',
      cell: ({ row }) => {
        const complaint = row.original;
        const nowUpvoted = complaint.myUpvoted;
        return (
          <button
            type="button"
            onClick={() =>
              upvoteMutation.mutate({ id: complaint.id, nowUpvoted: !nowUpvoted })
            }
            aria-label={nowUpvoted ? `Remove upvote from ${complaint.title}` : `Upvote ${complaint.title}`}
            aria-pressed={nowUpvoted}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${
              nowUpvoted ? 'border-teal bg-teal-light text-teal' : 'border-line text-muted'
            }`}
          >
            <ArrowUp size={12} /> {complaint.upvoteCount}
          </button>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const complaint = row.original;
        if (!isEditableByMe(complaint, user?.id)) return null;
        return (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditingId(complaint.id);
                setShowCreateForm(false);
              }}
              aria-label={`Edit ${complaint.title}`}
              className="text-muted"
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate(complaint.id)}
              aria-label={`Delete ${complaint.title}`}
              className="text-coral"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="m-0 font-display text-xl text-ink">Complaints</h1>
        {!showCreateForm && !editingId && (
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal px-3.5 py-2 text-sm font-semibold text-white"
          >
            <Plus size={14} /> Log a complaint
          </button>
        )}
      </div>

      {actionError && <ErrorBanner>{actionError}</ErrorBanner>}

      {showCreateForm && (
        <ComplaintForm mode="create" onDone={() => setShowCreateForm(false)} onCancel={() => setShowCreateForm(false)} />
      )}

      {editingComplaint && (
        <ComplaintForm
          mode="edit"
          initial={editingComplaint}
          onDone={() => setEditingId(null)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && <p role="alert" className="text-sm text-coral">Could not load complaints.</p>}
      {data && <DataTable data={data} columns={columns} emptyMessage="No complaints logged yet." />}
    </div>
  );
}
