import { User, Users } from 'lucide-react';
import type { FieldErrors, UseFormRegister } from 'react-hook-form';
import { ErrMsg, Field, inputClass, SectionHeader } from './FormField';

// Shared field-rendering sections for the "Flat details / Owner details / Occupancy /
// (conditional) Tenant details" form shape used both by the admin's flat-edit form
// (admin/FlatsListPage.tsx's FlatForm) and the resident's own "My details" form
// (MyDetailsPage.tsx) — see CLAUDE.md's ledger pivot note on why these two forms
// exist separately (different submit endpoints/payloads/permissions) rather than one
// merged component, and why only the genuinely-identical Owner/Occupancy sections are
// extracted here — Flat details (wing/flatNumber/baseRate) differs too much in
// interaction model (admin: register-bound and sometimes editable; resident: always a
// plain read-only display) to be worth forcing into one shared component.
//
// `register`/`errors` are intentionally loosely typed (`any` field-values generic) —
// the two callers use different, unrelated form value types that both happen to share
// these field names; this is the standard react-hook-form pattern for a field-set
// component reused across forms, since TS can't otherwise unify two independent
// generic form types.
interface OwnerContactFieldsProps {
  register: UseFormRegister<any>;
  errors: FieldErrors<any>;
}

export function OwnerDetailsFields({ register, errors }: OwnerContactFieldsProps) {
  return (
    <>
      <SectionHeader icon={User} title="Owner details" />
      <Field label="Full name">
        <input
          aria-label="Owner's full name"
          className={inputClass}
          placeholder="Owner's full name"
          {...register('ownerName')}
        />
        {errors.ownerName && <ErrMsg>{String(errors.ownerName.message)}</ErrMsg>}
      </Field>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Phone">
          <input
            aria-label="Owner's phone"
            className={inputClass}
            placeholder="+91 XXXXX XXXXX"
            {...register('ownerPhone')}
          />
        </Field>
        <Field label="Email">
          <input
            aria-label="Owner's email"
            type="email"
            className={inputClass}
            placeholder="owner@example.com"
            {...register('ownerEmail')}
          />
          {errors.ownerEmail && <ErrMsg>{String(errors.ownerEmail.message)}</ErrMsg>}
        </Field>
      </div>
    </>
  );
}

const OCCUPANCY_OPTIONS = [
  { key: 'owner' as const, label: 'Owner-occupied · 1x rate' },
  { key: 'tenant' as const, label: 'Tenant-occupied · 1.5x rate' },
];

interface OccupancyFieldsProps extends OwnerContactFieldsProps {
  occupancy: 'owner' | 'tenant';
  onOccupancyChange: (value: 'owner' | 'tenant') => void;
}

export function OccupancyFields({ register, errors, occupancy, onOccupancyChange }: OccupancyFieldsProps) {
  return (
    <>
      <SectionHeader icon={Users} title="Occupancy" />
      <div className="mb-4 flex gap-2" role="group" aria-label="Occupancy">
        {OCCUPANCY_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={occupancy === opt.key}
            onClick={() => onOccupancyChange(opt.key)}
            className={`flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold ${
              occupancy === opt.key ? 'border-teal bg-teal-light text-teal' : 'border-line bg-white text-ink'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {occupancy === 'tenant' && (
        <div className="rounded-lg border border-line bg-paper p-4">
          <p className="m-0 mb-3 text-xs font-semibold text-muted">Tenant details</p>
          <Field label="Full name">
            <input
              aria-label="Tenant's full name"
              className={inputClass}
              placeholder="Tenant's full name"
              {...register('tenantName')}
            />
            {errors.tenantName && <ErrMsg>{String(errors.tenantName.message)}</ErrMsg>}
          </Field>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <Field label="Phone">
              <input
                aria-label="Tenant's phone"
                className={inputClass}
                placeholder="+91 XXXXX XXXXX"
                {...register('tenantPhone')}
              />
            </Field>
            <Field label="Email">
              <input
                aria-label="Tenant's email"
                type="email"
                className={inputClass}
                placeholder="tenant@example.com"
                {...register('tenantEmail')}
              />
              {errors.tenantEmail && <ErrMsg>{String(errors.tenantEmail.message)}</ErrMsg>}
            </Field>
          </div>
          <Field label="Effective from">
            <input type="date" className={inputClass} {...register('effectiveFrom')} />
          </Field>
          <p className="m-0 text-xs text-muted">
            Used to calculate correct maintenance rates if occupancy changes mid-month.
          </p>
        </div>
      )}
    </>
  );
}
