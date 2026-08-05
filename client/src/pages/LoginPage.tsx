import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { apiFetch } from '../lib/api';
import { setAccessToken } from '../lib/auth-token';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface LoginResponse {
  accessToken: string;
  user: { id: string; name: string; email: string; role: string; societyId: string };
}

async function loginRequest(values: LoginFormValues): Promise<LoginResponse> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(values),
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? 'Login failed. Please try again.');
  }
  return body as LoginResponse;
}

export function LoginPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({ resolver: zodResolver(loginSchema) });

  const mutation = useMutation({
    mutationFn: loginRequest,
    onSuccess: ({ accessToken }) => {
      setAccessToken(accessToken);
      navigate('/dashboard');
    },
  });

  return (
    <main>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} noValidate>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email && <p role="alert">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password && <p role="alert">{errors.password.message}</p>}
        </div>

        {mutation.isError && <p role="alert">{mutation.error.message}</p>}

        <button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}
