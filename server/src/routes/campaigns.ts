import { Router } from 'express';
import {
  createCampaignSchema,
  emptySheetData,
  joinCampaignSchema,
  type CampaignDetail,
  type CampaignSummary,
} from '@party-sheets/shared';
import { prisma } from '../db';
import { isUniqueViolation } from '../lib/db-errors';
import { notFound } from '../lib/http-error';
import { generateInviteCode } from '../lib/invite-code';
import { authedUserId, requireAuth } from '../auth/require-auth';
import { findMembership, requireMembership } from '../access';
import { sheetInclude, toSheet } from '../serializers';
import type { RealtimeNotifier } from '../realtime/notifier';

const MAX_INVITE_CODE_ATTEMPTS = 5;

/**
 * Adds a player and their blank sheet in one transaction, so a player always has exactly
 * one sheet. Returns null if they're already a member, including when a simultaneous join
 * by the same player (e.g. a double-click) got in first.
 */
const addPlayer = async (userId: string, campaignId: string) => {
  if (await findMembership(userId, campaignId)) return null;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.membership.create({ data: { userId, campaignId, role: 'PLAYER' } });
      return tx.sheet.create({
        data: { campaignId, ownerId: userId, data: JSON.stringify(emptySheetData()) },
        include: sheetInclude,
      });
    });
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
};

export const campaignsRouter = (realtime: RealtimeNotifier) => {
  const router = Router();
  router.use(requireAuth);

  // Campaigns the current user belongs to, as DM or player.
  router.get('/', async (req, res) => {
    const memberships = await prisma.membership.findMany({
      where: { userId: authedUserId(req) },
      orderBy: { joinedAt: 'desc' },
      include: {
        campaign: {
          include: {
            dm: { select: { displayName: true } },
            _count: { select: { memberships: true } },
          },
        },
      },
    });

    const campaigns: CampaignSummary[] = memberships.map(({ role, campaign }) => ({
      id: campaign.id,
      name: campaign.name,
      role,
      dmName: campaign.dm.displayName,
      memberCount: campaign._count.memberships,
      createdAt: campaign.createdAt.toISOString(),
    }));
    res.json({ campaigns });
  });

  router.post('/', async (req, res) => {
    const userId = authedUserId(req);
    const { name } = createCampaignSchema.parse(req.body);

    // Invite codes are random; retry on the (rare) unique-constraint collision.
    for (let attempt = 1; ; attempt++) {
      try {
        const campaign = await prisma.campaign.create({
          data: {
            name,
            inviteCode: generateInviteCode(),
            dmId: userId,
            memberships: { create: { userId, role: 'DM' } },
          },
        });
        res.status(201).json({ campaign: { id: campaign.id } });
        return;
      } catch (err) {
        if (!isUniqueViolation(err) || attempt >= MAX_INVITE_CODE_ATTEMPTS) throw err;
      }
    }
  });

  router.post('/join', async (req, res) => {
    const userId = authedUserId(req);
    const { inviteCode } = joinCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({ where: { inviteCode } });
    if (!campaign) throw notFound('No campaign found for that invite code');

    const sheet = await addPlayer(userId, campaign.id);
    if (!sheet) {
      // Re-joining is idempotent: just send them back to the campaign.
      res.json({ campaign: { id: campaign.id }, alreadyMember: true });
      return;
    }

    realtime.memberJoined(campaign.id, toSheet(sheet));
    res.status(201).json({ campaign: { id: campaign.id }, alreadyMember: false });
  });

  router.get('/:campaignId', async (req, res) => {
    const membership = await requireMembership(authedUserId(req), req.params.campaignId);

    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: membership.campaignId },
      include: {
        memberships: {
          orderBy: { joinedAt: 'asc' },
          include: { user: { select: { id: true, displayName: true } } },
        },
      },
    });

    const detail: CampaignDetail = {
      id: campaign.id,
      name: campaign.name,
      role: membership.role,
      ...(membership.role === 'DM' ? { inviteCode: campaign.inviteCode } : {}),
      members: campaign.memberships.map((m) => ({
        userId: m.user.id,
        displayName: m.user.displayName,
        role: m.role,
      })),
    };
    res.json({ campaign: detail });
  });

  // DM: every sheet in the campaign. Player: only their own.
  router.get('/:campaignId/sheets', async (req, res) => {
    const userId = authedUserId(req);
    const membership = await requireMembership(userId, req.params.campaignId);

    const sheets = await prisma.sheet.findMany({
      where: {
        campaignId: membership.campaignId,
        ...(membership.role === 'DM' ? {} : { ownerId: userId }),
      },
      orderBy: { createdAt: 'asc' },
      include: sheetInclude,
    });
    res.json({ sheets: sheets.map(toSheet) });
  });

  return router;
};
