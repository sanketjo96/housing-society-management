import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

// Shared form building blocks.

export const inputClass =
  'w-full rounded-lg border border-line px-3 py-2.5 text-sm text-ink outline-none focus:border-teal disabled:bg-paper disabled:text-muted';

// Input nested inside <label> for a real implicit label/control association
// (getByLabelText, screen readers) — not just visual proximity.
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

// Standard mutation-error banner.
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

// Non-blocking configuration-gap warning (amber, not an error) — a prerequisite
// the admin needs to go set up, not a failure.
export function WarningBanner({ children }: { children: ReactNode }) {
  return (
    <div className="mb-3.5 flex items-start gap-2 rounded-lg bg-amber-light px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-brass" />
      <p className="m-0 text-[12.5px] text-ink">{children}</p>
    </div>
  );
}
