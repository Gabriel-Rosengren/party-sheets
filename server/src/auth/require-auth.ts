import type { RequestHandler } from 'express';
import { ACCOUNT_HEADER } from '@party-sheets/shared';
import { unauthorized } from '../lib/http-error';
import { sessionForAccount } from './session';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    sessionId?: string;
  }
}

/**
 * Requires the account named in the X-Account header to be signed in on this browser.
 * Acting as an account is never implicit: a tab that doesn't say who it is gets 401, even
 * if the browser holds sessions for other accounts.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const session = sessionForAccount(req.cookies ?? {}, req.get(ACCOUNT_HEADER));
  if (!session) return next(unauthorized());
  req.userId = session.userId;
  req.sessionId = session.sessionId;
  next();
};

/** For handlers mounted behind requireAuth. */
export const authedUserId = (req: { userId?: string }): string => {
  if (!req.userId) throw unauthorized();
  return req.userId;
};
