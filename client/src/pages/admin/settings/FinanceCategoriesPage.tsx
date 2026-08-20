import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Check, Plus, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { DataTable } from '../../../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../../../components/FormField';
import { authedFetch } from '../../../lib/api';

type Direction = 'INCOME' | 'EXPENSE';

interface FinanceCategory {
  id: string;
  name: string;
  description: string | null;
  direction: Direction;
  isActive: boolean;
}

async function fetchFinanceCategories(): Promise<FinanceCategory[]> {
  const res = await authedFetch('/api/admin/finance-categories?includeInactive=true');
  if (!res.ok) throw new Error('Could not load finance categories.');
  return res.json();
}

const financeCategoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  direction: z.enum(['INCOME', 'EXPENSE']),
  description: z.string().optional(),
});

type FinanceCategoryFormValues = z.infer<typeof financeCategoryFormSchema>;

// Same list<->form swap pattern as FeeTypesPage.tsx — this catalog's direct
// counterpart for the society-centric ledger (docs/manage-finance/), the one
// structural delta being the added Direction field.
function FinanceCategoryForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FinanceCategoryFormValues>({
    resolver: zodResolver(financeCategoryFormSchema),
    defaultValues: { direction: 'EXPENSE' },
  });

  const mutation = useMutation<unknown, Error, FinanceCategoryFormValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/admin/finance-categories', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not create finance category.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-finance-categories'] });
      onDone();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="rounded-2xl border border-line bg-white p-6"
    >
      <button
        type="button"
        onClick={onDone}
        className="mb-4 flex items-center gap-1.5 border-none bg-transparent p-0 text-xs text-muted"
      >
        <ArrowLeft size={13} /> Back to list
      </button>

      <h1 className="m-0 mb-4 font-display text-lg text-ink">Add finance category</h1>

      <Field label="Direction">
        <select className={inputClass} {...register('direction')}>
          <option value="EXPENSE">Expense</option>
          <option value="INCOME">Income</option>
        </select>
      </Field>
      <Field label="Name">
        <input className={inputClass} {...register('name')} />
        {errors.name && <ErrMsg>{errors.name.message}</ErrMsg>}
      </Field>
      <Field label="Description (optional)">
        <textarea rows={2} className={inputClass} {...register('description')} />
      </Field>

      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-2 flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        <Save size={14} /> {mutation.isPending ? 'Saving…' : 'Save category'}
      </button>
    </form>
  );
}

function ToggleActiveButton({ category }: { category: FinanceCategory }) {
  const queryClient = useQueryClient();
  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch(`/api/admin/finance-categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !category.isActive }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not update finance category.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-finance-categories'] }),
  });

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="rounded-md border border-line px-2 py-1 text-xs font-semibold text-ink disabled:opacity-70"
    >
      {category.isActive ? 'Deactivate' : 'Reactivate'}
    </button>
  );
}

const DIRECTION_META: Record<Direction, { className: string; label: string }> = {
  INCOME: { className: 'bg-teal-light text-teal', label: 'Income' },
  EXPENSE: { className: 'bg-coral-light text-coral', label: 'Expense' },
};

export function FinanceCategoriesPage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-finance-categories'],
    queryFn: fetchFinanceCategories,
  });

  const columns = useMemo<ColumnDef<FinanceCategory, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.name}
            {row.original.description && (
              <div className="text-xs text-muted">{row.original.description}</div>
            )}
          </span>
        ),
      },
      {
        id: 'direction',
        header: 'Direction',
        cell: ({ row }) => {
          const meta = DIRECTION_META[row.original.direction];
          return (
            <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}>
              {meta.label}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? (
            <span className="flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-1 text-xs font-semibold text-teal">
              <Check size={12} /> Active
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-xs font-semibold text-muted">
              <X size={12} /> Inactive
            </span>
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => <ToggleActiveButton category={row.original} />,
      },
    ],
    [],
  );

  if (showForm) {
    return (
      <div className="mx-auto max-w-4xl">
        <FinanceCategoryForm onDone={() => setShowForm(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-xl text-ink">Finance categories</h1>
          <p className="m-0 mt-0.5 text-xs text-muted">
            The catalog of income/expense heads (Electricity, Salaries, Bank Interest, ...) available when
            recording a transaction from the Manage Finance page.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={14} /> Add category
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load finance categories.
        </p>
      )}

      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(c) => c.id}
          emptyMessage="No finance categories yet — add one above."
        />
      )}
    </div>
  );
}
