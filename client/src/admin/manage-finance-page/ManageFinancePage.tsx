import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Download, Plus, Save, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../../components/data-table/DataTable';
import { ErrMsg, ErrorBanner, Field, inputClass, WarningBanner } from '../../components/form-field/FormField';
import { FileUploadField } from '../../components/file-upload-field/FileUploadField';
import { authedFetch } from '../../lib/api';
import type { Direction, PaymentMethod, SocietyLedgerEntryRow, FinanceCategoryOption } from './types';

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

// Plain <a href> can't carry the Bearer token, so fetch and hand off a blob: URL.
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

// OCR assist against a fresh upload, before the entry exists — read-only, never
// blocks: a failed call or a null result just leaves the field for manual entry.
async function inferBankReferenceFromFile(file: File): Promise<string | null> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await authedFetch('/api/admin/society-ledger/ocr-extract', { method: 'POST', body: formData });
  if (!res.ok) return null;
  const body = await res.json();
  return body.bankReference ?? null;
}

// One form with a direction toggle, submitted as FormData (includes a file).
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
  const [isInferring, setIsInferring] = useState(false);
  const [inferMessage, setInferMessage] = useState<string | null>(null);

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

      {!categoriesLoading && categories?.length === 0 && (
        <WarningBanner>
          No {direction === 'INCOME' ? 'Income' : 'Expense'} categories are set up yet, so there's
          nothing to record against. Add one on{' '}
          <Link to="/settings/finance-categories" className="font-semibold text-brass underline">
            Settings → Finance Categories
          </Link>{' '}
          first.
        </WarningBanner>
      )}

      <Field label="Category">
        <select
          disabled={categoriesLoading || categories?.length === 0}
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

      <div className="mb-3.5">
        <span className="mb-1.5 block text-xs font-semibold text-muted">Proof (bill, invoice, or receipt)</span>
        <FileUploadField file={file} onFileChange={setFile} required placeholder="Attach a bill, invoice, or receipt" />
      </div>

      <div className="mb-3.5">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="block text-xs font-semibold text-muted">
            {bankReferenceRequired ? 'Bank/transaction reference' : 'Bank/transaction reference (optional)'}
          </span>
          {bankReferenceRequired && (
            <button
              type="button"
              onClick={() => {
                if (!file) return;
                setInferMessage(null);
                setIsInferring(true);
                inferBankReferenceFromFile(file)
                  .then((value) => {
                    if (value) {
                      setBankReference(value);
                    } else {
                      setInferMessage('No reference detected — enter it manually.');
                    }
                  })
                  .finally(() => setIsInferring(false));
              }}
              disabled={isInferring || !file}
              className="border-none bg-transparent p-0 text-xs font-semibold text-teal disabled:cursor-default disabled:opacity-60"
            >
              {isInferring ? 'Inferring…' : 'Infer from proof'}
            </button>
          )}
        </div>
        <input
          type="text"
          value={bankReference}
          onChange={(e) => {
            setBankReference(e.target.value);
            setInferMessage(null);
          }}
          disabled={!bankReferenceRequired}
          className={inputClass}
          placeholder={bankReferenceRequired ? 'UTR / cheque number / transaction ID' : 'Not applicable for cash'}
        />
        {bankReferenceRequired && !isBankReferenceValid && bankReference.length === 0 && (
          <ErrMsg>A reference is required unless payment method is Cash.</ErrMsg>
        )}
        {inferMessage && <p className="mt-1 text-xs text-muted">{inferMessage}</p>}
        {bankReferenceRequired && !file && (
          <p className="mt-1 text-xs text-muted">Attach the proof above to enable "Infer from proof".</p>
        )}
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

const MONTH_FILTER_LABEL_FORMAT = new Intl.DateTimeFormat('en-IN', { month: 'short' });

export function ManageFinancePage() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-society-ledger'],
    queryFn: fetchSocietyLedgerEntries,
  });

  // Years actually present in the data, newest first.
  const availableYears = useMemo(() => {
    if (!data) return [];
    const years = new Set(data.map((e) => e.transactionDate.slice(0, 4)));
    return Array.from(years).sort().reverse();
  }, [data]);

  // Months present for the selected year (or across all years, if none is picked
  // yet) — the Month filter never offers a month with nothing to show.
  const availableMonths = useMemo(() => {
    if (!data) return [];
    const months = new Set(
      data
        .filter((e) => !yearFilter || e.transactionDate.slice(0, 4) === yearFilter)
        .map((e) => e.transactionDate.slice(5, 7)),
    );
    return Array.from(months).sort();
  }, [data, yearFilter]);

  const rows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.filter((e) => {
      if (yearFilter && e.transactionDate.slice(0, 4) !== yearFilter) return false;
      if (monthFilter && e.transactionDate.slice(5, 7) !== monthFilter) return false;
      if (!query) return true;
      const haystack = [
        e.direction,
        e.category.name,
        e.note ?? '',
        PAYMENT_METHOD_LABEL[e.paymentMethod],
        e.bankReference ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, search, yearFilter, monthFilter]);

  const columns = useMemo<ColumnDef<SocietyLedgerEntryRow, unknown>[]>(
    () => [
      {
        id: 'direction',
        header: 'Type',
        accessorFn: (row) => row.direction,
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
        accessorFn: (row) => row.category.name,
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
        accessorFn: (row) => Number(row.amount),
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
        accessorFn: (row) => row.transactionDate,
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
        accessorFn: (row) => row.paymentMethod,
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
        id: 'file',
        header: '',
        cell: ({ row }) => (row.original.fileUrl ? <FileDownloadButton entryId={row.original.id} /> : null),
      },
    ],
    [],
  );

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
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-muted">
              Year
              <select
                value={yearFilter}
                onChange={(e) => {
                  setYearFilter(e.target.value);
                  setMonthFilter('');
                }}
                className="mt-1 block rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
              >
                <option value="">All years</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-muted">
              Month
              <select
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                className="mt-1 block rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
              >
                <option value="">All months</option>
                {availableMonths.map((month) => (
                  <option key={month} value={month}>
                    {MONTH_FILTER_LABEL_FORMAT.format(new Date(`2000-${month}-01T00:00:00`))}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 text-xs font-semibold text-muted" style={{ minWidth: '12rem' }}>
              Search
              <div className="relative mt-1">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Category, note, payment method, or bank reference"
                  className="block w-full rounded-lg border border-line px-3 py-1.5 pr-8 text-sm text-ink"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 border-none bg-transparent p-0 text-muted"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </label>
            {(search || yearFilter || monthFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setYearFilter('');
                  setMonthFilter('');
                }}
                className="rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs font-semibold text-ink"
              >
                Clear
              </button>
            )}
          </div>

          <DataTable
            data={rows}
            columns={columns}
            getRowId={(e) => e.id}
            emptyMessage="No transactions found."
          />
        </>
      )}
    </div>
  );
}
