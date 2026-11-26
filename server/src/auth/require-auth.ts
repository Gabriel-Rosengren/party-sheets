import type { RequestHandler } from 'express';
import { unauthorized } from '../lib/http-error';
import { SESSION_COOKIE, verifySession } from './session';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const userId = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!userId) return next(unauthorized());
  req.userId = userId;
  next();
};

/** For handlers mounted behind requireAuth. */
export const authedUserId = (req: { userId?: string }): string => {
  if (!req.userId) throw unauthorized();
  return req.userId;
};
