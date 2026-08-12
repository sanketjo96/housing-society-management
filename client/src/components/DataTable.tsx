import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

// Column-level styling hooks (right-aligned numeric columns, a narrow checkbox
// column, etc.) — TanStack Table's `meta` is untyped by default, this fills it in so
// every page's column defs get autocomplete/type-checking instead of `as any`.
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'right';
    headerClassName?: string;
    cellClassName?: string;
  }
}

// Shared table shell (Task: "use TanStack Table everywhere" refactor) — replaces the
// hand-rolled <table>/<thead>/<tbody> markup that was duplicated byte-for-byte across
// FlatsListPage, MaintenancePage, and PaymentProofsPage. Deliberately thin: no
// filtering/pagination row models — this is a 24-flat MVP (CLAUDE.md: "correctness
// over scale, don't over-engineer"), every table here has at most a handful of rows,
// so those row models would be unused weight. Sorting is included but strictly
// opt-in per column: TanStack only allows sorting a column that defines an
// `accessorFn`/`accessorKey` (see `getCanSort`), so plain `id`+`cell` display columns
// (the pattern every other page's columns already use) stay unsortable without any
// extra flag — only a caller that deliberately adds an accessor gets a clickable
// header. Callers keep full control over cell content (badges, buttons, checkboxes,
// nested stateful components) via each column's `cell` renderer — this component
// only owns the table/thead/tbody chrome, sort toggling, and the empty-state row.
export function DataTable<T>({
  data,
  columns,
  emptyMessage,
  getRowId,
}: {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  emptyMessage: string;
  getRowId?: (row: T) => string;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(getRowId ? { getRowId } : {}),
  });

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className="border-b border-line text-left text-xs uppercase tracking-wide text-muted"
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`px-4 py-3 font-semibold ${header.column.columnDef.meta?.align === 'right' ? 'text-right' : ''} ${header.column.columnDef.meta?.headerClassName ?? ''}`}
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-muted hover:text-ink"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' ? (
                        <ArrowUp size={12} />
                      ) : header.column.getIsSorted() === 'desc' ? (
                        <ArrowDown size={12} />
                      ) : (
                        <ChevronsUpDown size={12} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-b border-line align-top last:border-0">
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className={`px-4 py-3 ${cell.column.columnDef.meta?.align === 'right' ? 'text-right' : ''} ${cell.column.columnDef.meta?.cellClassName ?? ''}`}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6 text-center text-sm text-muted">
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
