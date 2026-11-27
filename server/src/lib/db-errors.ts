import { Prisma } from '../generated/prisma/client';

/**
 * True when a write failed because a row with the same unique value already exists
 * (Prisma error P2002). A "does it exist yet?" check before a write can't rule this out,
 * because two requests can both pass the check before either one writes.
 */
export const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
