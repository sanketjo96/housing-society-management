import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import { useRef } from 'react';
import { authedFetch } from '../lib/api';

export function downloadCsvTemplate(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ImportResultBase {
  errors: { row: number; message: string }[];
}

// Shared shell for every CSV bulk-import panel under /imports/* (ImportsPage.tsx,
// BulkChargesImportPage.tsx, FinanceHistoryImportPage.tsx) — extracted 2026-08-21
// once the third near-identical copy of this panel (download template / upload /
// per-row error list) was about to be written. Each page supplies its own
// endpoint/template/labels and how to render its own success message (the three
// backends don't share a response shape — Flats returns `created`, the other two
// return `imported` — only `errors: [{ row, message }]` is common to all of them).
export function CsvImportPanel<T extends ImportResultBase>({
  title,
  description,
  endpoint,
  templateFilename,
  templateContent,
  invalidateQueryKeys = [],
  renderSuccessMessage,
}: {
  title: string;
  description: ReactNode;
  endpoint: string;
  templateFilename: string;
  templateContent: string;
  invalidateQueryKeys?: string[][];
  renderSuccessMessage: (data: T) => ReactNode;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Takes the file's raw text as the mutation variable (not component state) — no
  // textarea to hold it in; every backend still parses CSV text server-side, only
  // how that text reaches the request body changed, from "typed into a textarea"
  // to "read from an uploaded file".
  const mutation = useMutation<T, Error, string>({
    mutationFn: async (csv) => {
      const res = await authedFetch(endpoint, { method: 'POST', body: JSON.stringify({ csv }) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Import failed.');
      return body;
    },
    onSuccess: () =>
      invalidateQueryKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key })),
  });

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file (e.g. re-import after fixing errors)
    if (!file) return;
    mutation.mutate(await file.text());
  }

  return (
    <div className="mb-6 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 mb-1.5 font-display text-base text-ink">{title}</h2>
          <p className="m-0 text-xs text-muted">{description}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
          <button
            type="button"
            onClick={() => downloadCsvTemplate(templateFilename, templateContent)}
            className="flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink"
          >
            <FileSpreadsheet size={13} /> Download template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            aria-label="Upload CSV file"
            onChange={(e) => void handleFileSelected(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={mutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
          >
            <Upload size={13} /> {mutation.isPending ? 'Importing…' : 'Import CSV'}
          </button>
        </div>
      </div>

      {mutation.isSuccess && mutation.data && (
        <p className="mt-3 text-xs text-teal">{renderSuccessMessage(mutation.data)}</p>
      )}
      {mutation.isSuccess && mutation.data && mutation.data.errors.length > 0 && (
        <ul className="mt-1 list-disc pl-4 text-xs text-coral">
          {mutation.data.errors.map((e, i) => (
            <li key={i}>
              Row {e.row}: {e.message}
            </li>
          ))}
        </ul>
      )}
      {mutation.error && <p className="mt-2 text-xs text-coral">{mutation.error.message}</p>}
    </div>
  );
}
