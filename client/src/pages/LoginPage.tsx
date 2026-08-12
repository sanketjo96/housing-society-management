import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Building2, Lock, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ErrorBanner } from '../components/FormField';
import { useAuth } from '../context/AuthContext';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

// Purely decorative — a stylized floor/unit grid on the brand panel, not tied to
// any real flat or occupancy data.
const FLOORS = [6, 5, 4, 3, 2, 1];
const UNITS = ['A', 'B', 'C', 'D'];

function decorativeStatus(floor: number, unit: string) {
  const key = `${floor}${unit}`;
  if (['3B', '5D'].includes(key)) return 'bg-coral border-white/15';
  if (['4C', '2A'].includes(key)) return 'bg-brass border-white/15';
  if (key === '6D') return 'bg-transparent border-dashed border-line';
  return 'bg-teal border-white/15';
}

function BrandPanel() {
  return (
    <div className="flex flex-col justify-between bg-ink px-6 py-8 text-[#EDEFEA] sm:min-h-[560px] sm:px-10 sm:py-12">
      <div>
        <div className="mb-6 flex items-center gap-2 sm:mb-10">
          <Building2 size={20} className="text-brass" />
          <span className="font-display text-[19px] tracking-wide">Saral Society</span>
        </div>

        <p className="max-w-[280px] font-display text-[22px] leading-snug sm:text-[26px]">
          Your maintenance, dues, and receipts — all in one passbook.
        </p>
      </div>

      <div className="mt-6 hidden sm:block">
        <div className="mb-5 flex flex-col gap-1.5">
          {FLOORS.map((floor) => (
            <div key={floor} className="flex gap-1.5">
              {UNITS.map((unit) => (
                <div
                  key={unit}
                  className={`h-5 w-5 rounded border ${decorativeStatus(floor, unit)}`}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="font-mono-brand m-0 text-xs text-muted">Owner & tenant billing, simplified</p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const mutation = useMutation<void, Error, LoginFormValues>({
    mutationFn: (values) => login(values.email, values.password),
    onSuccess: () => {
      navigate('/dashboard');
    },
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper p-4 sm:p-6">
      <div className="grid w-full max-w-[660px] overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:grid-cols-[300px_1fr]">
        <BrandPanel />

        <div className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-12">
          <h1 className="m-0 mb-1.5 font-display text-[22px] text-ink">Log in</h1>
          <p className="m-0 mb-7 text-sm text-muted">
            Access your flat's dues and maintenance passbook.
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

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold text-muted">
                  Password
                </label>
                <Link to="/forgot-password" className="text-xs font-semibold text-teal">
                  Forgot password?
                </Link>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-line px-3 focus-within:border-teal">
                <Lock size={15} className="shrink-0 text-muted" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full border-none bg-transparent py-2.5 text-sm text-ink outline-none"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p role="alert" className="mt-1.5 text-xs text-coral">
                  {errors.password.message}
                </p>
              )}
            </div>

            {mutation.error && <ErrorBanner>{mutation.error.message}</ErrorBanner>}

            <button
              type="submit"
              disabled={mutation.isPending}
              className="mt-1 rounded-lg bg-teal px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-default disabled:opacity-70"
            >
              {mutation.isPending ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-muted">
            Accounts are created by your society admin.
            <br />
            Contact them if you don't have one yet.
          </p>
          <p className="m-0 mt-3 text-center text-[10px] text-muted opacity-70">Designed by Sanket Joshi</p>
        </div>
      </div>
    </main>
  );
}
