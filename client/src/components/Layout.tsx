import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { state, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-800/80 bg-stone-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-lg text-amber-400">
            <img src="/d20.svg" alt="" className="size-7" />
            Party Sheets
          </Link>
          {state.status === 'authenticated' && (
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-stone-400 sm:inline">{state.user.displayName}</span>
              <button type="button" className="btn btn-ghost py-1.5" onClick={() => void logout()}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <img src="/d20.svg" alt="" className="size-10 animate-spin [animation-duration:2s]" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Gate for signed-in pages; remembers where the user was headed. */
export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Login/register pages bounce signed-in users to where they were going. */
export function RedirectIfAuthed() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') return <FullPageSpinner />;
  if (state.status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }
  return <Outlet />;
}
