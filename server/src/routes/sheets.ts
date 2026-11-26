import { Router } from 'express';
import { updateSheetSchema } from '@party-sheets/shared';
import { prisma } from '../db';
import { forbidden, notFound } from '../lib/http-error';
import { authedUserId, requireAuth } from '../auth/require-auth';
import { findMembership } from '../access';
import { sheetInclude, toSheet } from '../serializers';
import type { RealtimeNotifier } from '../realtime/notifier';

export const sheetsRouter = (realtime: RealtimeNotifier) => {
  const router = Router();
  router.use(requireAuth);

  /** The owner and the campaign's DM may read a sheet; nobody else learns it exists. */
  const loadReadableSheet = async (userId: string, sheetId: string) => {
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId }, include: sheetInclude });
    if (!sheet) throw notFound('Sheet not found');
    if (sheet.ownerId === userId) return sheet;
    const membership = await findMembership(userId, sheet.campaignId);
    if (membership?.role !== 'DM') throw notFound('Sheet not found');
    return sheet;
  };

  router.get('/:sheetId', async (req, res) => {
    const sheet = await loadReadableSheet(authedUserId(req), req.params.sheetId);
    res.json({ sheet: toSheet(sheet) });
  });

  // Full replacement of the sheet data. Only the owner may write in the MVP.
  router.put('/:sheetId', async (req, res) => {
    const userId = authedUserId(req);
    const existing = await loadReadableSheet(userId, req.params.sheetId);
    if (existing.ownerId !== userId) throw forbidden('Only the owner can edit this sheet');

    const { data } = updateSheetSchema.parse(req.body);
    const updated = await prisma.sheet.update({
      where: { id: existing.id },
      data: { data: JSON.stringify(data), version: { increment: 1 } },
      include: sheetInclude,
    });

    const sheet = toSheet(updated);
    realtime.sheetUpdated(sheet);
    res.json({ sheet });
  });

  return router;
};
