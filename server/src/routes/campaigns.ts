import { Router } from 'express';
import {
  createCampaignSchema,
  emptySheetData,
  joinCampaignSchema,
  type CampaignDetail,
  type CampaignSummary,
} from '@party-sheets/shared';
import { prisma } from '../db';
import { Prisma } from '../generated/prisma/client';
import { notFound } from '../lib/http-error';
import { generateInviteCode } from '../lib/invite-code';
import { authedUserId, requireAuth } from '../auth/require-auth';
import { requireMembership } from '../access';
import { sheetInclude, toSheet } from '../serializers';
import type { RealtimeNotifier } from '../realtime/notifier';

const MAX_INVITE_CODE_ATTEMPTS = 5;

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
        const isCollision =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
        if (!isCollision || attempt >= MAX_INVITE_CODE_ATTEMPTS) throw err;
      }
    }
  });

  router.post('/join', async (req, res) => {
    const userId = authedUserId(req);
    const { inviteCode } = joinCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({ where: { inviteCode } });
    if (!campaign) throw notFound('No campaign found for that invite code');

    const existing = await prisma.membership.findUnique({
      where: { userId_campaignId: { userId, campaignId: campaign.id } },
    });
    if (existing) {
      // Re-joining is idempotent: just send them back to the campaign.
      res.json({ campaign: { id: campaign.id }, alreadyMember: true });
      return;
    }

    const sheet = await prisma.$transaction(async (tx) => {
      await tx.membership.create({ data: { userId, campaignId: campaign.id, role: 'PLAYER' } });
      return tx.sheet.create({
        data: { campaignId: campaign.id, ownerId: userId, data: JSON.stringify(emptySheetData()) },
        include: sheetInclude,
      });
    });

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
