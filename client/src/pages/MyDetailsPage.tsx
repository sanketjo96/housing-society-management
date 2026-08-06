import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Home, User, Users } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Divider, ErrorBanner, ErrMsg, Field, inputClass, SectionHeader } from '../components/FormField';
import { useAuth } from '../context/AuthContext';
import { authedFetch } from '../lib/api';
import type { ResidentSummary } from '../types';

interface MyFlat {
  id: string;
  block: string;
  flatNumber: string;
  baseRate: string;
  owner: ResidentSummary;
  currentTenant: ResidentSummary | null;
  occupancyEffectiveFrom: string | null;
}

// 403 (an ADMIN visiting this page — GET /api/me/flat is OWNER/TENANT only) and 404
// (no flat linked yet) both mean "nothing to show here" from this page's point of
// view — the profile section below still works regardless.
async function fetchMyFlat(): Promise<MyFlat | null> {
  const res = await authedFetch('/api/me/flat');
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error('Could not load your flat.');
  return res.json();
}

function FlatDetailsSection({ flat }: { flat: MyFlat }) {
  return (
    <section>
      <SectionHeader icon={Home} title="Flat details" />
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Block">
          <input className={inputClass} value={flat.block} disabled />
        </Field>
        <Field label="Flat number">
          <input className={inputClass} value={flat.flatNumber} disabled />
        </Field>
      </div>
      <Field label="Base maintenance rate (₹ / month)">
        <input className={inputClass} value={flat.baseRate} disabled />
      </Field>
      <p className="-mt-2 text-xs text-muted">Set by your society admin and can&apos;t be changed here.</p>
    </section>
  );
}

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email address'),
});
type ProfileValues = z.infer<typeof profileSchema>;

function ProfileSection() {
  const { user, refreshUser } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    values: user ? { name: user.name, phone: user.phone ?? '', email: user.email } : undefined,
  });

  const mutation = useMutation<unknown, Error, ProfileValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/me', { method: 'PATCH', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save your details.');
      return body;
    },
    // Without this, AuthContext's `user` (and anything reading useAuth().user, e.g.
    // the Dashboard header) would keep showing the pre-edit name/email until the next
    // full page load — PATCH /api/me only updates the database, not local auth state.
    onSuccess: () => void refreshUser(),
  });

  return (
    <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
      <SectionHeader icon={User} title="My details" />
      <Field label="Full name">
        <input aria-label="Your full name" className={inputClass} {...register('name')} />
        {errors.name && <ErrMsg>{errors.name.message}</ErrMsg>}
      </Field>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Phone">
          <input aria-label="Your phone" className={inputClass} {...register('phone')} />
        </Field>
        <Field label="Email">
          <input aria-label="Your email" type="email" className={inputClass} {...register('email')} />
          {errors.email && <ErrMsg>{errors.email.message}</ErrMsg>}
        </Field>
      </div>

      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          {mutation.isPending ? 'Saving…' : 'Save changes'}
        </button>
        {mutation.isSuccess && (
          <span className="flex items-center gap-1.5 text-sm text-teal">
            <Check size={14} /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

const tenantSchema = z.object({
  name: z.string().min(1, "Tenant's name is required"),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email address'),
  effectiveFrom: z.string().optional(),
});
type TenantValues = z.infer<typeof tenantSchema>;

function TenantForm({ flat }: { flat: MyFlat }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TenantValues>({
    resolver: zodResolver(tenantSchema),
    values: flat.currentTenant
      ? {
          name: flat.currentTenant.name,
          phone: flat.currentTenant.phone ?? '',
          email: flat.currentTenant.email,
          effectiveFrom: flat.occupancyEffectiveFrom?.slice(0, 10) ?? '',
        }
      : { name: '', phone: '', email: '', effectiveFrom: '' },
  });

  const saveMutation = useMutation<unknown, Error, TenantValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/me/flat/tenant', { method: 'PUT', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save tenant details.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-flat'] }),
  });

  const removeMutation = useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await authedFetch('/api/me/flat/tenant', { method: 'DELETE' });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not remove tenant.');
      return body;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-flat'] }),
  });

  const error = saveMutation.error ?? removeMutation.error;

  return (
    <form onSubmit={handleSubmit((values) => saveMutation.mutate(values))} noValidate>
      <Field label="Full name">
        <input
          aria-label="Tenant's full name"
          className={inputClass}
          placeholder="Tenant's full name"
          {...register('name')}
        />
        {errors.name && <ErrMsg>{errors.name.message}</ErrMsg>}
      </Field>
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Phone">
          <input
            aria-label="Tenant's phone"
            className={inputClass}
            placeholder="+91 XXXXX XXXXX"
            {...register('phone')}
          />
        </Field>
        <Field label="Email">
          <input
            aria-label="Tenant's email"
            type="email"
            className={inputClass}
            placeholder="tenant@example.com"
            {...register('email')}
          />
          {errors.email && <ErrMsg>{errors.email.message}</ErrMsg>}
        </Field>
      </div>
      <Field label="Effective from">
        <input type="date" className={inputClass} {...register('effectiveFrom')} />
      </Field>
      <p className="-mt-2 mb-3.5 text-xs text-muted">
        Used to calculate correct maintenance rates if occupancy changes mid-month.
      </p>

      {error && <ErrorBanner>{error.message}</ErrorBanner>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          {saveMutation.isPending ? 'Saving…' : flat.currentTenant ? 'Save changes' : 'Add tenant'}
        </button>
        {flat.currentTenant && (
          <button
            type="button"
            onClick={() => removeMutation.mutate()}
            disabled={removeMutation.isPending}
            className="rounded-lg border border-coral px-4 py-2.5 text-sm font-semibold text-coral disabled:cursor-default disabled:opacity-70"
          >
            {removeMutation.isPending ? 'Removing…' : 'Remove tenant'}
          </button>
        )}
        {saveMutation.isSuccess && (
          <span className="flex items-center gap-1.5 text-sm text-teal">
            <Check size={14} /> Saved
          </span>
        )}
      </div>
    </form>
  );
}

function OccupancySection({ flat }: { flat: MyFlat }) {
  return (
    <section>
      <SectionHeader icon={Users} title="Occupancy" />
      <p className="mb-3.5 text-sm text-ink">
        Currently:{' '}
        <span className="font-semibold">
          {flat.currentTenant ? `Tenant-occupied (${flat.currentTenant.name})` : 'Owner-occupied'}
        </span>
      </p>
      <TenantForm flat={flat} />
    </section>
  );
}

export function MyDetailsPage() {
  const { user } = useAuth();
  const {
    data: flat,
    isLoading,
    isError,
  } = useQuery({ queryKey: ['my-flat'], queryFn: fetchMyFlat });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="m-0 mb-6 font-display text-xl text-ink">My details</h1>

      {isLoading && <p className="text-sm text-muted">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-coral">
          Could not load your flat.
        </p>
      )}

      <div className="rounded-2xl border border-line bg-white p-6">
        {flat && (
          <>
            <FlatDetailsSection flat={flat} />
            <Divider />
          </>
        )}

        <ProfileSection />

        {flat && user?.role === 'OWNER' && (
          <>
            <Divider />
            <OccupancySection flat={flat} />
          </>
        )}
      </div>

      {!isLoading && !flat && !isError && (
        <p className="mt-4 text-sm text-muted">
          No flat is linked to your account yet — contact your society admin.
        </p>
      )}
    </div>
  );
}
