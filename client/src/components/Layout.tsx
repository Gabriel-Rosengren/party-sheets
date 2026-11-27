import { useRef } from 'react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import type { PublicUser } from '@party-sheets/shared';
import { useAuth } from '../auth/AuthContext';

const MENU_ITEM = 'block w-full rounded-md px-2 py-1.5 text-left text-stone-200 hover:bg-stone-800';

/** Account name plus a menu to switch to another signed-in account, add one or sign out. */
function AccountMenu({ user }: { user: PublicUser }) {
  const { accounts, refreshAccounts, switchAccount, addAccount, logout } = useAuth();
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const otherAccounts = accounts.filter((a) => a.id !== user.id);
  const closeMenu = () => menu.current?.removeAttribute('open');

  return (
    <details
      ref={menu}
      className="relative"
      onToggle={(e) => e.currentTarget.open && void refreshAccounts()}
    >
      <summary className="btn btn-ghost cursor-pointer list-none py-1.5 text-sm">
        {user.displayName} <span aria-hidden>▾</span>
      </summary>
      <div className="card absolute right-0 z-10 mt-2 w-64 p-2 text-sm shadow-xl">
        <p className="truncate px-2 py-1 text-xs text-stone-500">Signed in as {user.email}</p>
        {otherAccounts.map((other) => (
          <button
            key={other.id}
            type="button"
            className={MENU_ITEM}
            onClick={() => {
              closeMenu();
              void switchAccount(other).then(() => navigate('/'));
            }}
          >
            Switch to {other.displayName}
          </button>
        ))}
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            closeMenu();
            addAccount();
          }}
        >
          Add another account
        </button>
        <button
          type="button"
          className={MENU_ITEM}
          onClick={() => {
            closeMenu();
            void logout();
          }}
        >
          Sign out
        </button>
      </div>
    </details>
  );
}

export function Layout() {
  const { state } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-800/80 bg-stone-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-display text-lg text-amber-400">
            <img src="/d20.svg" alt="" className="size-7" />
            Party Sheets
          </Link>
          {state.status === 'authenticated' && <AccountMenu user={state.user} />}
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
  // Keyed by account so a page never carries one account's data over to another.
  return <Outlet key={state.user.id} />;
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
