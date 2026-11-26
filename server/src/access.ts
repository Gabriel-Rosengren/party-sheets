import { prisma } from './db';
import { notFound } from './lib/http-error';

export const findMembership = (userId: string, campaignId: string) =>
  prisma.membership.findUnique({ where: { userId_campaignId: { userId, campaignId } } });

/**
 * Loads the caller's membership or throws 404. Non-members get "not found" rather than
 * "forbidden" so campaign ids can't be probed for existence.
 */
export const requireMembership = async (userId: string, campaignId: string) => {
  const membership = await findMembership(userId, campaignId);
  if (!membership) throw notFound('Campaign not found');
  return membership;
};
