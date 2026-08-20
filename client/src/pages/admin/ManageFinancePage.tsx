import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Download, Plus, Save } from 'lucide-react';
import { useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass } from '../../components/FormField';
import { FileUploadField } from '../../components/FileUploadField';
import { authedFetch } from '../../lib/api';

type Direction = 'INCOME' | 'EXPENSE';
type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'OTHER';

interface SocietyLedgerEntryRow {
  id: string;
  direction: Direction;
  amount: string;
  transactionDate: string;
  paymentMethod: PaymentMethod;
  bankReference: string | null;
  note: string | null;
  fileUrl: string | null;
  category: { id: string; name: string; direction: Direction };
  recordedBy: { id: string; name: string };
}

interface FinanceCategoryOption {
  id: string;
  name: string;
  direction: Direction;
}

async function fetchSocietyLedgerEntries(): Promise<SocietyLedgerEntryRow[]> {
  const res = await authedFetch('/api/admin/society-ledger');
  if (!res.ok) throw new Error('Could not load Manage Finance entries.');
  return res.json();
}

async function fetchActiveFinanceCategories(direction: Direction): Promise<FinanceCategoryOption[]> {
  const res = await authedFetch(`/api/admin/finance-categories?direction=${direction}`);
  if (!res.ok) throw new Error('Could not load finance categories.');
  return res.json();
}

// The authenticated file endpoint doesn't carry a Bearer token via a plain <a href>,
// same reasoning as LedgerEntryDisplay.tsx's downloadReceipt — fetch it ourselves and
// hand the browser a blob: URL.
async function downloadSocietyLedgerFile(entryId: string) {
  const res = await authedFetch(`/api/admin/society-ledger/${entryId}/file`);
  if (!res.ok) throw new Error('Could not load this file.');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function FileDownloadButton({ entryId }: { entryId: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          downloadSocietyLedgerFile(entryId).catch((e: Error) => setError(e.message));
        }}
        className="flex items-center gap-1 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Download size={12} /> File
      </button>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </>
  );
}

// Single combined form with a direction toggle (confirmed decision — one "Manage
// Finance" page, not two separate Income/Expense flows), same list<->form swap
// pattern as OtherChargesPage.tsx's BillChargeForm. Submitted as FormData since a
// file is involved.
function RecordEntryForm({ onDone }: { onDone: () => void }) {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<Direction>('EXPENSE');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [bankReference, setBankReference] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['admin-finance-categories-active', direction],
    queryFn: () => fetchActiveFinanceCategories(direction),
  });

  const parsedAmount = Number(amount);
  const isAmountValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;
  const bankReferenceRequired = paymentMethod !== 'CASH';
  const isBankReferenceValid = !bankReferenceRequired || bankReference.trim() !== '';
  const isFormValid =
    isAmountValid && categoryId !== '' && transactionDate !== '' && isBankReferenceValid && !!file;

  const mutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('direction', direction);
      formData.append('categoryId', categoryId);
      formData.append('amount', amount);
      formData.append('transactionDate', transactionDate);
      formData.append('paymentMethod', paymentMethod);
      if (bankReference.trim()) formData.append('bankReference', bankReference.trim());
      if (note.trim()) formData.append('note', note.trim());
      if (file) formData.append('file', file);
      const res = await authedFetch('/api/admin/society-ledger', { method: 'POST', body: formData });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not record this transaction.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-society-ledger'] });
      // Society Finance dashboard cards depend on this feature's totals — refresh
      // them immediately rather than waiting out the 30s staleTime (same precedent
      // as OtherChargesPage.tsx's BillChargeForm onSuccess).
      queryClient.invalidateQueries({ queryKey: ['admin-dashboard-summary'] });
      onDone();
    },
  });

  return (
    <div className="rounded-2xl border border-line bg-white p-6">
      <button
        type="button"
        onClick={onDone}
        className="mb-4 flex items-center gap-1.5 border-none bg-transparent p-0 text-xs text-muted"
      >
        <ArrowLeft size={13} /> Back to list
      </button>

      <h1 className="m-0 mb-4 font-display text-lg text-ink">Record a transaction</h1>

      <Field label="Direction">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setDirection('EXPENSE');
              setCategoryId('');
            }}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
              direction === 'EXPENSE' ? 'border-coral bg-coral-light text-coral' : 'border-line text-muted'
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => {
              setDirection('INCOME');
              setCategoryId('');
            }}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold ${
              direction === 'INCOME' ? 'border-teal bg-teal-light text-teal' : 'border-line text-muted'
            }`}
          >
            Income
          </button>
        </div>
      </Field>

      <Field label="Category">
        <select
          disabled={categoriesLoading}
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={inputClass}
        >
          <option value="">Select a category…</option>
          {categories?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Amount">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Transaction date">
        <input
          type="date"
          value={transactionDate}
          onChange={(e) => setTransactionDate(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Payment method">
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          className={inputClass}
        >
          <option value="CASH">Cash</option>
          <option value="BANK_TRANSFER">Bank transfer</option>
          <option value="UPI">UPI</option>
          <option value="CHEQUE">Cheque</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>

      <Field label={bankReferenceRequired ? 'Bank/transaction reference' : 'Bank/transaction reference (optional)'}>
        <input
          type="text"
          value={bankReference}
          onChange={(e) => setBankReference(e.target.value)}
          disabled={!bankReferenceRequired}
          className={inputClass}
          placeholder={bankReferenceRequired ? 'UTR / cheque number / transaction ID' : 'Not applicable for cash'}
        />
        {bankReferenceRequired && !isBankReferenceValid && bankReference.length === 0 && (
          <ErrMsg>A reference is required unless payment method is Cash.</ErrMsg>
        )}
      </Field>

      <div className="mb-3.5">
        <span className="mb-1.5 block text-xs font-semibold text-muted">Proof (bill, invoice, or receipt)</span>
        <FileUploadField file={file} onFileChange={setFile} required placeholder="Attach a bill, invoice, or receipt" />
      </div>

      <Field label="Note (optional)">
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
      </Field>

      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending || !isFormValid}
        className="mt-2 flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        <Save size={14} /> {mutation.isPending ? 'Saving…' : 'Record transaction'}
      </button>
    </div>
  );
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  OTHER: 'Other',
};

export function ManageFinancePage() {
  const [showForm, setShowForm] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-society-ledger'],
    queryFn: fetchSocietyLedgerEntries,
  });

  const columns: ColumnDef<SocietyLedgerEntryRow, unknown>[] = [
    {
      id: 'direction',
      header: 'Type',
      cell: ({ row }) => (
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${
            row.original.direction === 'INCOME' ? 'bg-teal-light text-teal' : 'bg-coral-light text-coral'
          }`}
        >
          {row.original.direction === 'INCOME' ? 'Income' : 'Expense'}
        </span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      cell: ({ row }) => (
        <span className="text-ink">
          {row.original.category.name}
          {row.original.note && <div className="text-xs text-muted">{row.original.note}</div>}
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      meta: { align: 'right' },
      cell: ({ row }) => (
        <span
          className={`font-mono-brand ${row.original.direction === 'INCOME' ? 'text-teal' : 'text-coral'}`}
        >
          {row.original.direction === 'INCOME' ? '+' : '−'}₹{Number(row.original.amount).toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      id: 'date',
      header: 'Transaction date',
      cell: ({ row }) => (
        <span className="text-ink">
          {new Date(row.original.transactionDate).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </span>
      ),
    },
    {
      id: 'method',
      header: 'Payment method',
      cell: ({ row }) => (
        <span className="text-ink">
          {PAYMENT_METHOD_LABEL[row.original.paymentMethod]}
          {row.original.bankReference && (
            <div className="font-mono-brand text-xs text-muted">{row.original.bankReference}</div>
          )}
        </span>
      ),
    },
    {
      id: 'recordedBy',
      header: 'Recorded by',
      cell: ({ row }) => <span className="text-ink">{row.original.recordedBy.name}</span>,
    },
    {
      id: 'file',
      header: '',
      cell: ({ row }) => (row.original.fileUrl ? <FileDownloadButton entryId={row.original.id} /> : null),
    },
  ];

  if (showForm) {
    return (
      <div className="mx-auto max-w-4xl">
        <RecordEntryForm onDone={() => setShowForm(false)} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="m-0 font-display text-xl text-ink">Manage Finance</h1>
          <p className="m-0 mt-0.5 text-xs text-muted">
            {data?.length ?? 0} transaction{data?.length === 1 ? '' : 's'} recorded
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white"
        >
          <Plus size={14} /> Record a transaction
        </button>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load Manage Finance entries.
        </p>
      )}

      {data && (
        <DataTable
          data={data}
          columns={columns}
          getRowId={(e) => e.id}
          emptyMessage="No transactions recorded yet."
        />
      )}
    </div>
  );
}
