import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

// Shared file-select control (file browser via click, or drag-and-drop). `required`
// only changes the placeholder/label text; the actual required-ness is enforced by
// the caller's form submit (server re-validates regardless, never trust the client).
export function FileUploadField({
  file,
  onFileChange,
  required = false,
  placeholder,
  ariaLabel,
  accept = DEFAULT_ACCEPT,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
  required?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const label = file?.name ?? placeholder ?? (required ? 'Attach a screenshot (required)' : 'Attach a screenshot (optional)');

  function handleDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileChange(dropped);
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        aria-label={ariaLabel ?? label}
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs ${
          isDragging ? 'border-teal bg-teal-light text-teal' : 'border-muted bg-transparent text-muted'
        }`}
      >
        <Upload size={14} /> {label}
      </button>
    </div>
  );
}
