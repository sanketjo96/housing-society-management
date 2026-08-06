import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Home, Save, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { OccupancyFields, OwnerDetailsFields } from '../components/FlatFieldsForm';
import { Divider, ErrMsg, ErrorBanner, Field, inputClass, SectionHeader } from '../components/FormField';
import { useAuth } from '../context/AuthContext';
import { authedFetch } from '../lib/api';
import type { ResidentSummary } from '../types';

interface MyFlat {
  id: string;
  wing: string;
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
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <Field label="Wing">
          <input className={inputClass} value={flat.wing} disabled />
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

// A TENANT's own profile (name/phone/email). An OWNER never sees this — the combined
// flat form below (MyFlatForm) edits the exact same fields via its "Owner details"
// section, so a second, redundant "edit your name" form would just duplicate it.
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
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
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

// Always shaped like the mockup's MyDetailsTab — occupancy/tenant fields are simply
// unused when occupancy stays 'owner', rather than needing a second parallel schema.
const myFlatSchema = z
  .object({
    ownerName: z.string().min(1, "Owner's name is required"),
    ownerPhone: z.string().optional(),
    ownerEmail: z.string().email('Enter a valid email address'),
    occupancy: z.enum(['owner', 'tenant']),
    tenantName: z.string().optional(),
    tenantPhone: z.string().optional(),
    tenantEmail: z.string().optional(),
    effectiveFrom: z.string().optional(),
  })
  .refine((data) => data.occupancy !== 'tenant' || (!!data.tenantName && !!data.tenantEmail), {
    message: 'Tenant name and email are required when tenant-occupied',
    path: ['tenantEmail'],
  });

type MyFlatFormInput = z.input<typeof myFlatSchema>;
type MyFlatFormValues = z.infer<typeof myFlatSchema>;

// The OWNER-only combined "My details" form — same visual shape as admin's flat-edit
// form (FlatsListPage.tsx's FlatForm): Flat details (locked), Owner details, Occupancy,
// conditional Tenant details, one "Save changes" button. Reuses
// OwnerDetailsFields/OccupancyFields (components/FlatFieldsForm.tsx) — the exact same
// sections the admin form uses — and PUT /api/me/flat, which itself reuses
// updateFlat's find-or-create-tenant-inline mechanism server-side
// (flats.service.ts) — this is where occupancy changes are self-reported.
function MyFlatForm({ flat }: { flat: MyFlat }) {
  const queryClient = useQueryClient();
  const { refreshUser } = useAuth();
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<MyFlatFormInput, unknown, MyFlatFormValues>({
    resolver: zodResolver(myFlatSchema),
    defaultValues: {
      ownerName: flat.owner.name,
      ownerPhone: flat.owner.phone ?? '',
      ownerEmail: flat.owner.email,
      occupancy: flat.currentTenant ? 'tenant' : 'owner',
      tenantName: flat.currentTenant?.name ?? '',
      tenantPhone: flat.currentTenant?.phone ?? '',
      tenantEmail: flat.currentTenant?.email ?? '',
      effectiveFrom: flat.occupancyEffectiveFrom?.slice(0, 10) ?? '',
    },
  });
  const occupancy = watch('occupancy');

  const mutation = useMutation<unknown, Error, MyFlatFormValues>({
    mutationFn: async (values) => {
      const res = await authedFetch('/api/me/flat', { method: 'PUT', body: JSON.stringify(values) });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? 'Could not save your flat.');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-flat'] });
      // The dashboard header shows the caller's own name — keep it in sync if the
      // owner just edited it here.
      void refreshUser();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      noValidate
      className="rounded-2xl border border-line bg-white p-6"
    >
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="m-0 font-display text-lg text-ink">
            Flat {flat.wing}-{flat.flatNumber}
          </h1>
          <p className="m-0 mt-0.5 text-xs text-muted">My details</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-teal-light px-2.5 py-1 text-xs font-semibold text-teal">
          <Check size={12} /> Onboarded
        </span>
      </div>

      <FlatDetailsSection flat={flat} />

      <Divider />

      <OwnerDetailsFields register={register} errors={errors} />

      <Divider />

      <OccupancyFields
        register={register}
        errors={errors}
        occupancy={occupancy}
        onOccupancyChange={(value) => setValue('occupancy', value)}
      />

      {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="flex items-center gap-2 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-default disabled:opacity-70"
        >
          <Save size={14} /> {mutation.isPending ? 'Saving…' : 'Save changes'}
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

      {flat && user?.role === 'OWNER' && <MyFlatForm flat={flat} />}

      {flat && user?.role === 'TENANT' && (
        <div className="rounded-2xl border border-line bg-white p-6">
          <FlatDetailsSection flat={flat} />
          <Divider />
          <ProfileSection />
        </div>
      )}

      {!isLoading && !flat && !isError && (
        <div className="rounded-2xl border border-line bg-white p-6">
          <ProfileSection />
          <p className="mt-4 text-sm text-muted">
            No flat is linked to your account yet — contact your society admin.
          </p>
        </div>
      )}
    </div>
  );
}
