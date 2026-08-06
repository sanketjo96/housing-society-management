import { AlertCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared building blocks for the app's admin/resident forms (MyDetailsPage,
// admin/FlatsListPage) — previously duplicated byte-for-byte across both files.

export const inputClass =
  'w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:border-teal disabled:bg-paper disabled:text-muted';

// The input is nested inside <label>, not a sibling — this creates a real implicit
// label/control association (what getByLabelText and screen readers both rely on),
// not just visual proximity. A label immediately before/after its input with no
// htmlFor/id link looks right but isn't programmatically associated with anything.
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

export function ErrMsg({ children }: { children: ReactNode }) {
  return (
    <span role="alert" className="mt-1.5 block text-xs text-coral">
      {children}
    </span>
  );
}

export function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="mb-3.5 flex items-center gap-2">
      <Icon size={15} className="text-brass" />
      <h2 className="m-0 font-display text-base text-ink">{title}</h2>
    </div>
  );
}

export const Divider = () => <div className="my-5 border-t border-line" />;

// Standard mutation-error banner — was styled two different ways (icon+flex vs a bare
// <p>) across pages for the exact same failure state; unified here.
export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-start gap-2 rounded-lg bg-coral-light px-3 py-2.5">
      <AlertCircle size={14} className="mt-0.5 shrink-0 text-coral" />
      <p role="alert" className="m-0 text-[12.5px] text-[#5C1F14]">
        {children}
      </p>
    </div>
  );
}
