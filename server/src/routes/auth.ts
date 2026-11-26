import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { loginSchema, registerSchema } from '@party-sheets/shared';
import { prisma } from '../db';
import { env } from '../env';
import { conflict, notFound, unauthorized } from '../lib/http-error';
import { authedUserId, requireAuth } from '../auth/require-auth';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from '../auth/session';
import { toPublicUser } from '../serializers';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so response time doesn't reveal which
// emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS);

export const authRouter = Router();

const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  message: { error: 'Too many attempts, try again later' },
});

authRouter.post('/register', credentialLimiter, async (req, res) => {
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

  res.cookie(SESSION_COOKIE, signSession(user.id), sessionCookieOptions);
  res.status(201).json({ user: toPublicUser(user) });
});

authRouter.post('/login', credentialLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');

  res.cookie(SESSION_COOKIE, signSession(user.id), sessionCookieOptions);
  res.json({ user: toPublicUser(user) });
});

authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions;
  res.clearCookie(SESSION_COOKIE, clearOptions);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: authedUserId(req) } });
  if (!user) throw notFound('User no longer exists');
  res.json({ user: toPublicUser(user) });
});
