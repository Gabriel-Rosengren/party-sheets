import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LoginInput, PublicUser, RegisterInput } from '@party-sheets/shared';
import { api, ApiRequestError } from '../lib/api';

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: PublicUser };

interface AuthContextValue {
  state: AuthState;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  // The session lives in an httpOnly cookie, so ask the server who we are.
  useEffect(() => {
    api
      .me()
      .then(({ user }) => setState({ status: 'authenticated', user }))
      .catch((err: unknown) => {
        if (!(err instanceof ApiRequestError && err.status === 401)) console.error(err);
        setState({ status: 'anonymous', user: null });
      });
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const { user } = await api.login(input);
    setState({ status: 'authenticated', user });
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const { user } = await api.register(input);
    setState({ status: 'authenticated', user });
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setState({ status: 'anonymous', user: null });
  }, []);

  const value = useMemo(
    () => ({ state, login, register, logout }),
    [state, login, register, logout],
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
