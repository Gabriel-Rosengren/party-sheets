import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { ACCOUNT_HEADER, loginSchema, registerSchema } from '@party-sheets/shared';
import { prisma } from '../db';
import { env } from '../env';
import { conflict, notFound, unauthorized } from '../lib/http-error';
import { authedUserId, requireAuth } from '../auth/require-auth';
import {
  LEGACY_SESSION_COOKIE,
  MAX_ACCOUNTS_PER_BROWSER,
  clearSessionCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
  sessionForAccount,
  sessionsInJar,
  signSession,
} from '../auth/session';
import type { RealtimeNotifier } from '../realtime/notifier';
import { toPublicUser } from '../serializers';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so response time doesn't reveal which
// emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { error: 'Too many attempts, try again later' },
});

export const authRouter = (realtime: RealtimeNotifier) => {
  const router = Router();

  const endSession = (res: Response, userId: string, sessionId: string) => {
    res.clearCookie(sessionCookieName(userId), clearSessionCookieOptions);
    realtime.sessionEnded(sessionId);
  };

  /**
   * Adds a session for `userId` next to the browser's other accounts. Other accounts are
   * left alone (that's what keeps other tabs on their own account), except the oldest
   * ones beyond the per-browser limit.
   */
  const startSession = (req: Request, res: Response, userId: string) => {
    const others = sessionsInJar(req.cookies ?? {}).filter((s) => s.userId !== userId);
    for (const stale of others.slice(MAX_ACCOUNTS_PER_BROWSER - 1)) {
      endSession(res, stale.userId, stale.sessionId);
    }
    if (req.cookies?.[LEGACY_SESSION_COOKIE]) {
      res.clearCookie(LEGACY_SESSION_COOKIE, clearSessionCookieOptions);
    }
    res.cookie(sessionCookieName(userId), signSession(userId), sessionCookieOptions);
  };

  router.post('/register', credentialLimiter, async (req, res) => {
    const input = registerSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw conflict('An account with that email already exists');

    const user = await prisma.user.create({
      data: {
        email: input.email,
        displayName: input.displayName,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
      },
    });

    startSession(req, res, user.id);
    res.status(201).json({ user: toPublicUser(user) });
  });

  router.post('/login', credentialLimiter, async (req, res) => {
    const input = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const passwordMatches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) throw unauthorized('Invalid email or password');

    startSession(req, res, user.id);
    res.json({ user: toPublicUser(user) });
  });

  // Signs out only the account this tab acts as; other accounts stay signed in.
  router.post('/logout', (req, res) => {
    const session = sessionForAccount(req.cookies ?? {}, req.get(ACCOUNT_HEADER));
    if (session) endSession(res, session.userId, session.sessionId);
    res.status(204).end();
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: authedUserId(req) } });
    if (!user) throw notFound('User no longer exists');
    res.json({ user: toPublicUser(user) });
  });

  /** Accounts signed in on this browser, most recent first. A new tab picks from these. */
  router.get('/accounts', async (req, res) => {
    const sessions = sessionsInJar(req.cookies ?? {});
    const users = await prisma.user.findMany({
      where: { id: { in: sessions.map((s) => s.userId) } },
    });
    // Keep the sessions' order (most recent first); skip users that were deleted.
    const usersById = new Map(users.map((u) => [u.id, u]));
    const accounts = sessions.flatMap((s) => {
      const user = usersById.get(s.userId);
      return user ? [toPublicUser(user)] : [];
    });
    res.json({ accounts });
  });

  return router;
};
