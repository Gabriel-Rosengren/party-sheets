import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import { env, isProd } from '../env';

export const SESSION_COOKIE = 'ps_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_TTL_SECONDS * 1000,
};

export const signSession = (userId: string): string =>
  jwt.sign({}, env.JWT_SECRET, { subject: userId, expiresIn: SESSION_TTL_SECONDS });

/** Returns the userId for a valid token, otherwise null. */
export const verifySession = (token: string | undefined): string | null => {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

/** Used by the Socket.IO handshake, which only has the raw Cookie header. */
export const userIdFromCookieHeader = (header: string | undefined): string | null =>
  header ? verifySession(parseCookie(header)[SESSION_COOKIE]) : null;
