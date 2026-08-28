import { X } from 'lucide-react';
import type { ReactNode } from 'react';

// Generic modal: title/subtitle/close + arbitrary children.
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidthClassName = 'max-w-sm',
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(24,36,32,0.45)] p-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${maxWidthClassName} rounded-2xl bg-white p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="m-0 font-display text-lg text-ink">{title}</p>
            {subtitle && <p className="m-0 mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="border-none bg-transparent p-0 text-muted"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
