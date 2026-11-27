import { randomUUID } from 'node:crypto';
import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { env, isProd } from '../env';

/**
 * One browser can hold sessions for several accounts at once (e.g. a DM tab and a player
 * tab). Each account gets its own httpOnly cookie, `ps_s_<userId>`, and every request names
 * the account it acts as (the X-Account header, or `auth.accountId` on the socket).
 *
 * The cookie holds a signed JWT, but a valid signature isn't enough: the token's `jti` must
 * also match a row in the Session table. Signing out deletes that row, so the token is
 * refused at once, even by a request that still carries the cookie.
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
  /** JWT id and Session row id: identifies this login, for sign-out and its sockets. */
  sessionId: string;
  /** Seconds since epoch; used to order accounts by most recent sign-in. */
  issuedAt: number;
}

/** Records a new sign-in for `userId` and returns the token for its cookie. */
export const createSession = async (userId: string): Promise<string> => {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  // Housekeeping: expired rows are useless, and a sign-in is a cheap moment to drop them.
  await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.session.create({ data: { id: sessionId, userId, expiresAt } });
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    jwtid: sessionId,
    expiresIn: SESSION_TTL_SECONDS,
  });
};

/** Signs a session out everywhere: its token is refused from now on. */
export const revokeSession = async (sessionId: string): Promise<void> => {
  await prisma.session.deleteMany({ where: { id: sessionId } });
};

/** Checks a token's signature and expiry only. Callers must also check the Session row. */
const decodeToken = (token: string | undefined): Session | null => {
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

/** Of the given sessions, the ones still recorded for the same user and not expired. */
const stillActive = async (sessions: Session[]): Promise<Session[]> => {
  if (sessions.length === 0) return [];
  const rows = await prisma.session.findMany({
    where: { id: { in: sessions.map((s) => s.sessionId) }, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true },
  });
  const userIdBySession = new Map(rows.map((r) => [r.id, r.userId]));
  return sessions.filter((s) => userIdBySession.get(s.sessionId) === s.userId);
};

type CookieJar = Record<string, string | undefined>;

/**
 * The session a request acts as: the named account, if the browser holds a valid cookie
 * for it. The token's subject must match the cookie's name, so cookies can't be swapped.
 */
export const sessionForAccount = async (
  cookies: CookieJar,
  accountId: string | undefined,
): Promise<Session | null> => {
  if (!accountId) return null;
  const session = decodeToken(cookies[sessionCookieName(accountId)]);
  if (session?.userId !== accountId) return null;
  const [active] = await stillActive([session]);
  return active ?? null;
};

/** Every active session the browser holds, most recently signed in first. */
export const sessionsInJar = async (cookies: CookieJar): Promise<Session[]> => {
  const decoded = Object.entries(cookies).flatMap(([name, token]) => {
    if (!name.startsWith(COOKIE_PREFIX)) return [];
    const session = decodeToken(token);
    return session && name === sessionCookieName(session.userId) ? [session] : [];
  });
  return (await stillActive(decoded)).sort((a, b) => b.issuedAt - a.issuedAt);
};
