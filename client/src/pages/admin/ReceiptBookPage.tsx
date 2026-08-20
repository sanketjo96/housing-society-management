import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '../../components/DataTable';
import { LedgerCategoryBadge, type LedgerCategory } from '../../components/LedgerCategoryBadge';
import { LedgerTypeBadge, type LedgerEntryType } from '../../components/LedgerTypeBadge';
import { authedFetch } from '../../lib/api';
import { downloadAuthedFile } from '../../lib/download-file';

interface ReceiptListItem {
  id: string;
  receiptNumber: string;
  issuedAt: string;
  ledgerEntry: {
    id: string;
    type: LedgerEntryType;
    category: LedgerCategory;
    amount: string;
    note: string | null;
    payer: { id: string; name: string; email: string };
    flat: { id: string; wing: string; flatNumber: string };
  };
}

// A read-only register of every issued receipt — distinct from Payment Proofs
// (a pending-review queue repurposed to also show approved rows). No pagination,
// no server-side filtering: fetched once, then filtered/searched client-side, same
// convention as MaintenanceBookPage's date-range filter — this is a 24-flat MVP.
async function fetchReceipts(): Promise<ReceiptListItem[]> {
  const res = await authedFetch('/api/admin/receipts');
  if (!res.ok) throw new Error('Could not load the receipt book.');
  return res.json();
}

function ReceiptDownloadCell({ ledgerEntryId }: { ledgerEntryId: string }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          downloadAuthedFile(
            `/api/ledger-entries/${ledgerEntryId}/receipt`,
            'No receipt was issued for this entry.',
          ).catch((e: Error) => setError(e.message));
        }}
        className="flex items-center gap-1.5 border-none bg-transparent p-0 text-xs font-semibold text-teal"
      >
        <Download size={13} /> Download
      </button>
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </>
  );
}

export function ReceiptBookPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-receipts'],
    queryFn: fetchReceipts,
  });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    if (!data) return [];
    const query = search.trim().toLowerCase();
    return data.filter((r) => {
      const d = r.issuedAt.slice(0, 10);
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (!query) return true;
      const haystack = [
        r.receiptNumber,
        r.ledgerEntry.payer.name,
        `${r.ledgerEntry.flat.wing}-${r.ledgerEntry.flat.flatNumber}`,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, fromDate, toDate, search]);

  const columns = useMemo<ColumnDef<ReceiptListItem, unknown>[]>(
    () => [
      {
        id: 'receiptNumber',
        header: 'Receipt #',
        cell: ({ row }) => <span className="font-mono-brand text-ink">{row.original.receiptNumber}</span>,
      },
      {
        id: 'issuedAt',
        header: 'Date issued',
        cell: ({ row }) => (
          <span className="text-ink">
            {new Date(row.original.issuedAt).toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        ),
      },
      {
        id: 'flat',
        header: 'Flat',
        cell: ({ row }) => (
          <span className="text-ink">
            {row.original.ledgerEntry.flat.wing}-{row.original.ledgerEntry.flat.flatNumber}
            <div className="text-xs text-muted">{row.original.ledgerEntry.payer.name}</div>
          </span>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        cell: ({ row }) => <LedgerTypeBadge type={row.original.ledgerEntry.type} />,
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => <LedgerCategoryBadge category={row.original.ledgerEntry.category} />,
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { align: 'right' },
        cell: ({ row }) => (
          <span className="font-mono-brand text-ink">
            ₹{Number(row.original.ledgerEntry.amount).toLocaleString('en-IN')}
          </span>
        ),
      },
      {
        id: 'download',
        header: '',
        cell: ({ row }) => <ReceiptDownloadCell ledgerEntryId={row.original.ledgerEntry.id} />,
      },
    ],
    [],
  );

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="m-0 font-display text-xl text-ink">Receipt Book</h1>
        <p className="m-0 mt-0.5 text-xs text-muted">{data?.length ?? 0} receipts issued</p>
      </div>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load the receipt book.
        </p>
      )}

      {data && (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-muted">
              From
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-1 block rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="text-xs font-semibold text-muted">
              To
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-1 block rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex-1 text-xs font-semibold text-muted" style={{ minWidth: '12rem' }}>
              Search
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Receipt #, flat, or resident name"
                className="mt-1 block w-full rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
              />
            </label>
            {(fromDate || toDate || search) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setSearch('');
                }}
                className="rounded-lg border border-line bg-transparent px-3 py-1.5 text-xs font-semibold text-ink"
              >
                Clear
              </button>
            )}
          </div>

          <DataTable data={rows} columns={columns} getRowId={(r) => r.id} emptyMessage="No receipts found." />
        </>
      )}
    </div>
  );
}
