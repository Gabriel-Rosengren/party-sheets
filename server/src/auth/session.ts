import { randomUUID } from 'node:crypto';
import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../env';

/**
 * One browser can hold sessions for several accounts at once (e.g. a DM tab and a player
 * tab). Each account gets its own httpOnly cookie, `ps_s_<userId>`, and every request names
 * the account it acts as (the X-Account header, or `auth.accountId` on the socket).
 */
const COOKIE_PREFIX = 'ps_s_';
/** Cookie name used before per-account sessions; no longer accepted, cleared on sign-in. */
export const LEGACY_SESSION_COOKIE = 'ps_session';
/** Oldest sessions are signed out beyond this many accounts per browser. */
export const MAX_ACCOUNTS_PER_BROWSER = 4;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const sessionCookieName = (userId: string) => `${COOKIE_PREFIX}${userId}`;

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_SECONDS * 1000,
};

const { maxAge: _maxAge, ...optionsWithoutMaxAge } = sessionCookieOptions;
/** Options for res.clearCookie: the same path and flags, minus maxAge. */
export const clearSessionCookieOptions: CookieOptions = optionsWithoutMaxAge;

export interface Session {
  userId: string;
  /** JWT id: identifies this login, so its sockets can be closed on sign-out. */
  sessionId: string;
  /** Seconds since epoch; used to order accounts by most recent sign-in. */
  issuedAt: number;
}

export const signSession = (userId: string): string =>
  jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    jwtid: randomUUID(),
    expiresIn: SESSION_TTL_SECONDS,
  });

/** Returns the session for a valid token, otherwise null. */
export const verifySession = (token: string | undefined): Session | null => {
  if (!token) return null;
  try {
    const claims = jwt.verify(token, env.JWT_SECRET);
    if (
      typeof claims !== 'object' ||
      typeof claims.sub !== 'string' ||
      typeof claims.jti !== 'string'
    ) {
      return null;
    }
    return { userId: claims.sub, sessionId: claims.jti, issuedAt: claims.iat ?? 0 };
  } catch {
    return null;
  }
};

type CookieJar = Record<string, string | undefined>;

/**
 * The session a request acts as: the named account, if the browser holds a valid cookie
 * for it. The token's subject must match the cookie's name, so cookies can't be swapped.
 */
export const sessionForAccount = (
  cookies: CookieJar,
  accountId: string | undefined,
): Session | null => {
  if (!accountId) return null;
  const session = verifySession(cookies[sessionCookieName(accountId)]);
  return session?.userId === accountId ? session : null;
};

/** Every valid session the browser holds, most recently signed in first. */
export const sessionsInJar = (cookies: CookieJar): Session[] =>
  Object.entries(cookies)
    .flatMap(([name, token]) => {
      if (!name.startsWith(COOKIE_PREFIX)) return [];
      const session = verifySession(token);
      return session && name === sessionCookieName(session.userId) ? [session] : [];
    })
    .sort((a, b) => b.issuedAt - a.issuedAt);
