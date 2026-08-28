import { useMutation } from '@tanstack/react-query';
import { Phone, Search } from 'lucide-react';
import { useState } from 'react';
import { ErrorBanner, Field, inputClass } from '../../components/form-field/FormField';
import { authedFetch } from '../../lib/api';

interface VehicleSearchResult {
  found: boolean;
  wing?: string;
  flatNumber?: string;
  occupantName?: string;
  occupantPhone?: string | null;
}

async function searchVehicle(plate: string): Promise<VehicleSearchResult> {
  const res = await authedFetch(`/api/vehicles/search?plate=${encodeURIComponent(plate)}`);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? 'Could not search for that plate.');
  return body;
}

export function VehicleFinderPage() {
  const [plate, setPlate] = useState('');
  const mutation = useMutation<VehicleSearchResult, Error, string>({ mutationFn: searchVehicle });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="m-0 mb-1 font-display text-xl text-ink">Vehicle Finder</h1>
      <p className="m-0 mb-6 text-xs text-muted">
        Look up a parked vehicle's plate number to find which flat it belongs to.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = plate.trim();
          if (trimmed) mutation.mutate(trimmed);
        }}
        noValidate
        className="mb-6 rounded-2xl border border-line bg-white p-6"
      >
        <Field label="Plate number">
          <input
            aria-label="Plate number"
            className={inputClass}
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder="e.g. MH12AB1234"
          />
        </Field>
        <button
          type="submit"
          disabled={mutation.isPending || !plate.trim()}
          className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          <Search size={14} /> {mutation.isPending ? 'Searching…' : 'Search'}
        </button>
        {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}
      </form>

      {mutation.data &&
        (mutation.data.found ? (
          <div className="rounded-2xl border border-line bg-white p-6">
            <p className="m-0 mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Match found</p>
            <p className="m-0 font-display text-lg text-ink">
              Flat {mutation.data.wing}-{mutation.data.flatNumber}
            </p>
            <p className="m-0 mt-2 text-sm text-ink">{mutation.data.occupantName}</p>
            {mutation.data.occupantPhone && (
              // tel: link — on mobile this opens the dialer directly, since the
              // whole point of a match here is "call them right now," not just
              // display their number.
              <a
                href={`tel:${mutation.data.occupantPhone}`}
                className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-teal"
              >
                <Phone size={14} /> {mutation.data.occupantPhone}
              </a>
            )}
          </div>
        ) : (
          <p role="status" className="text-sm text-muted">
            No vehicle found for that plate.
          </p>
        ))}
    </div>
  );
}
