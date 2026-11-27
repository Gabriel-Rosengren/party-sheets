import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LoginInput, PublicUser, RegisterInput } from '@party-sheets/shared';
import { api, ApiRequestError, setSessionLostHandler } from '../lib/api';
import { tabAccount } from '../lib/tab-account';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: PublicUser };

interface AuthContextValue {
  state: AuthState;
  /** Every account signed in on this browser, most recent first (this tab's included). */
  accounts: PublicUser[];
  refreshAccounts: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** Signs out this tab's account only; other accounts stay signed in. */
  logout: () => Promise<void>;
  /** Makes this tab act as another account that is already signed in on this browser. */
  switchAccount: (user: PublicUser) => Promise<void>;
  /** Shows the sign-in page in this tab without signing anyone out. */
  addAccount: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const is401 = (err: unknown) => err instanceof ApiRequestError && err.status === 401;

/**
 * Each tab acts as exactly one account (see lib/tab-account.ts), and never switches
 * account on its own: only this tab's sign-in, sign-out or account switch changes it.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const [accounts, setAccounts] = useState<PublicUser[]>([]);

  const refreshAccounts = useCallback(async () => {
    try {
      setAccounts((await api.accounts()).accounts);
    } catch (err) {
      console.error(err);
    }
  }, []);

  /**
   * Works out who this tab is. With `pickOnlyAccount`, a tab that hasn't chosen yet (a new
   * tab) adopts the browser's account if there is exactly one; with several it asks.
   */
  const resolveTabAccount = useCallback(
    async (pickOnlyAccount: boolean) => {
      if (tabAccount.get()) {
        try {
          const { user } = await api.me();
          setState({ status: 'authenticated', user });
          void refreshAccounts();
          return;
        } catch (err) {
          if (!is401(err)) console.error(err);
          else tabAccount.clear();
        }
      }
      // This tab has no (valid) account yet: look at what the browser is signed in to.
      let browserAccounts: PublicUser[] = [];
      try {
        browserAccounts = (await api.accounts()).accounts;
      } catch (err) {
        console.error(err);
      }
      setAccounts(browserAccounts);
      const [only] = browserAccounts;
      if (pickOnlyAccount && only && browserAccounts.length === 1) {
        tabAccount.set(only.id);
        setState({ status: 'authenticated', user: only });
        return;
      }
      setState({ status: 'anonymous', user: null });
    },
    [refreshAccounts],
  );

  useEffect(() => {
    void resolveTabAccount(true);
    // This tab's session ended elsewhere (signed out in another tab, expired): re-check
    // rather than keep showing an account the server no longer accepts.
    setSessionLostHandler(() => void resolveTabAccount(false));
    return () => setSessionLostHandler(null);
  }, [resolveTabAccount]);

  /** After a sign-in or sign-up in this tab: this tab now acts as `user`. */
  const actAs = useCallback(
    (user: PublicUser) => {
      tabAccount.set(user.id);
      setState({ status: 'authenticated', user });
      void refreshAccounts();
    },
    [refreshAccounts],
  );

  const login = useCallback(
    async (input: LoginInput) => actAs((await api.login(input)).user),
    [actAs],
  );

  const register = useCallback(
    async (input: RegisterInput) => actAs((await api.register(input)).user),
    [actAs],
  );

  const logout = useCallback(async () => {
    await api.logout();
    tabAccount.clear();
    await resolveTabAccount(false);
  }, [resolveTabAccount]);

  const switchAccount = useCallback(
    async (user: PublicUser) => {
      tabAccount.set(user.id);
      await resolveTabAccount(false);
    },
    [resolveTabAccount],
  );

  const addAccount = useCallback(() => {
    tabAccount.clear();
    setState({ status: 'anonymous', user: null });
    void refreshAccounts();
  }, [refreshAccounts]);

  const value = useMemo(
    () => ({
      state,
      accounts,
      refreshAccounts,
      login,
      register,
      logout,
      switchAccount,
      addAccount,
    }),
    [state, accounts, refreshAccounts, login, register, logout, switchAccount, addAccount],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For components rendered behind <RequireAuth>, where a user is guaranteed. */
export function useCurrentUser(): PublicUser {
  const { state } = useAuth();
  if (state.status !== 'authenticated') throw new Error('useCurrentUser used while signed out');
  return state.user;
}
