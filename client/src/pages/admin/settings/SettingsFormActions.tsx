import { Check } from 'lucide-react';
import { ErrorBanner } from '../../../components/FormField';

// The submit button + error/success footer was identical across all three settings
// pages (only the fields above it differ) — shared here instead of copy-pasted
// three times.
export function SettingsFormActions({
  error,
  saved,
  pending,
  disabled,
}: {
  error?: string;
  saved: boolean;
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <>
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {saved && (
        <p className="mb-3.5 flex items-center gap-1.5 text-xs font-semibold text-teal">
          <Check size={13} /> Saved.
        </p>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
      >
        {pending ? 'Saving…' : 'Save changes'}
      </button>
    </>
  );
}
