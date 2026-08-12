import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Building2, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { ErrorBanner } from '../components/FormField';
import { apiFetch } from '../lib/api';

const forgotPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

async function requestReset(email: string): Promise<void> {
  const res = await apiFetch('/api/auth/request-reset', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Something went wrong. Please try again.');
  }
}

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({ resolver: zodResolver(forgotPasswordSchema) });

  const mutation = useMutation<void, Error, ForgotPasswordFormValues>({
    mutationFn: (values) => requestReset(values.email),
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper p-4 sm:p-6">
      <div className="w-full max-w-[380px] rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-10">
        <div className="mb-6 flex items-center gap-2">
          <Building2 size={20} className="text-brass" />
          <span className="font-display text-[19px] tracking-wide text-ink">Saral Society</span>
        </div>

        {mutation.isSuccess ? (
          <>
            <h1 className="m-0 mb-1.5 font-display text-[22px] text-ink">Check your email</h1>
            <p className="m-0 mb-6 text-sm text-muted">
              If an account exists for that email, we've sent a link to reset your password.
            </p>
            <Link to="/login" className="text-sm font-semibold text-teal">
              Back to log in
            </Link>
          </>
        ) : (
          <>
            <h1 className="m-0 mb-1.5 font-display text-[22px] text-ink">Reset your password</h1>
            <p className="m-0 mb-7 text-sm text-muted">
              Enter your email and we'll send you a link to reset your password.
            </p>

            <form
              onSubmit={handleSubmit((values) => mutation.mutate(values))}
              noValidate
              className="flex flex-col gap-4"
            >
              <div>
                <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-muted">
                  Email
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-teal">
                  <Mail size={15} className="shrink-0 text-muted" />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full border-none bg-transparent py-2.5 text-sm text-ink outline-none"
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <p role="alert" className="mt-1.5 text-xs text-coral">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {mutation.isError && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

              <button
                type="submit"
                disabled={mutation.isPending}
                className="mt-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-default disabled:opacity-70"
              >
                {mutation.isPending ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-muted">
              <Link to="/login" className="font-semibold text-teal">
                Back to log in
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
