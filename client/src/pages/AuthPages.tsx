import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ApiRequestError } from '../lib/api';

type Mode = 'login' | 'register';

function AuthForm({ mode }: { mode: Mode }) {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === 'register';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      if (isRegister) await register({ email, displayName, password });
      else await login({ email, password });
      // <RedirectIfAuthed> navigates once the auth state flips.
    } catch (err) {
      if (err instanceof ApiRequestError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors);
      } else {
        setError('Something went wrong. Is the server running?');
      }
      setSubmitting(false);
    }
  };

  const fieldError = (name: string) =>
    fieldErrors[name] && <p className="mt-1 text-xs text-red-400">{fieldErrors[name]}</p>;

  return (
    <div className="mx-auto max-w-sm pt-8">
      <h1 className="mb-2 text-center font-display text-3xl text-stone-100">
        {isRegister ? 'Join the party' : 'Welcome back'}
      </h1>
      <p className="mb-8 text-center text-sm text-stone-400">
        {isRegister
          ? 'Create an account to start or join a campaign.'
          : 'Sign in to reach your campaigns.'}
      </p>

      <form onSubmit={onSubmit} className="card space-y-4 p-6" noValidate>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" autoComplete="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          {fieldError('email')}
        </div>
        {isRegister && (
          <div>
            <label htmlFor="displayName" className="label">Display name</label>
            <input id="displayName" autoComplete="nickname" required className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            {fieldError('displayName')}
          </div>
        )}
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            minLength={isRegister ? 8 : undefined}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isRegister && !fieldErrors.password && <p className="mt-1 text-xs text-stone-500">At least 8 characters.</p>}
          {fieldError('password')}
        </div>

        {error && !Object.keys(fieldErrors).length && (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
          {submitting ? 'One moment…' : isRegister ? 'Create account' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone-400">
        {isRegister ? 'Already have an account? ' : 'New here? '}
        <Link to={isRegister ? '/login' : '/register'} className="text-amber-400 hover:underline">
          {isRegister ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}

export const LoginPage = () => <AuthForm mode="login" />;
export const RegisterPage = () => <AuthForm mode="register" />;
