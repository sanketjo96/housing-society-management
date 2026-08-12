import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Building2, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ErrorBanner } from '../components/FormField';
import { apiFetch } from '../lib/api';

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

async function resetPassword(token: string, newPassword: string): Promise<void> {
  const res = await apiFetch('/api/auth/reset', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Something went wrong. Please try again.');
  }
}

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({ resolver: zodResolver(resetPasswordSchema) });

  const mutation = useMutation<void, Error, ResetPasswordFormValues>({
    mutationFn: (values) => resetPassword(token ?? '', values.newPassword),
    onSuccess: () => {
      navigate('/login');
    },
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper p-4 sm:p-6">
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-6 flex items-center gap-2">
          <Building2 size={20} className="text-brass" />
          <span className="font-display text-[19px] tracking-wide text-ink">Saral Society</span>
        </div>

        {!token ? (
          <>
            <h1 className="m-0 mb-1.5 font-display text-[22px] text-ink">Invalid reset link</h1>
            <p className="m-0 mb-6 text-sm text-muted">
              This password reset link is missing or malformed.
            </p>
            <Link to="/forgot-password" className="text-sm font-semibold text-teal">
              Request a new link
            </Link>
          </>
        ) : (
          <>
            <h1 className="m-0 mb-1.5 font-display text-[22px] text-ink">Set a new password</h1>
            <p className="m-0 mb-7 text-sm text-muted">Choose a new password for your account.</p>

            <form
              onSubmit={handleSubmit((values) => mutation.mutate(values))}
              noValidate
              className="flex flex-col gap-4"
            >
              <div>
                <label htmlFor="newPassword" className="mb-1.5 block text-xs font-semibold text-muted">
                  New password
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-teal">
                  <Lock size={15} className="shrink-0 text-muted" />
                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="w-full border-none bg-transparent py-2.5 text-sm text-ink outline-none"
                    {...register('newPassword')}
                  />
                </div>
                {errors.newPassword && (
                  <p role="alert" className="mt-1.5 text-xs text-coral">
                    {errors.newPassword.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-semibold text-muted">
                  Confirm password
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-teal">
                  <Lock size={15} className="shrink-0 text-muted" />
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="w-full border-none bg-transparent py-2.5 text-sm text-ink outline-none"
                    {...register('confirmPassword')}
                  />
                </div>
                {errors.confirmPassword && (
                  <p role="alert" className="mt-1.5 text-xs text-coral">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              {mutation.isError && (
                <ErrorBanner>
                  {mutation.error.message}{' '}
                  <Link to="/forgot-password" className="font-semibold underline">
                    Request a new link
                  </Link>
                </ErrorBanner>
              )}

              <button
                type="submit"
                disabled={mutation.isPending}
                className="mt-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-default disabled:opacity-70"
              >
                {mutation.isPending ? 'Resetting…' : 'Reset password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
