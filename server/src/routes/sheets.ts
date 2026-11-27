import { Router } from 'express';
import { updateSheetSchema, type SheetConflict } from '@party-sheets/shared';
import { prisma } from '../db';
import { notFound } from '../lib/http-error';
import { authedUserId, requireAuth } from '../auth/require-auth';
import { findMembership } from '../access';
import { sheetInclude, toSheet } from '../serializers';
import type { RealtimeNotifier } from '../realtime/notifier';

export const sheetsRouter = (realtime: RealtimeNotifier) => {
  const router = Router();
  router.use(requireAuth);

  /**
   * The owner and the campaign's DM may read and edit a sheet. Everyone else gets a 404,
   * so they don't learn the sheet exists.
   */
  const loadAccessibleSheet = async (userId: string, sheetId: string) => {
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId }, include: sheetInclude });
    if (!sheet) throw notFound('Sheet not found');
    if (sheet.ownerId === userId) return sheet;
    const membership = await findMembership(userId, sheet.campaignId);
    if (membership?.role !== 'DM') throw notFound('Sheet not found');
    return sheet;
  };

  router.get('/:sheetId', async (req, res) => {
    const sheet = await loadAccessibleSheet(authedUserId(req), req.params.sheetId);
    res.json({ sheet: toSheet(sheet) });
  });

  // Full replacement of the sheet data, with optimistic concurrency: the write only lands
  // if nobody else saved since the client's `baseVersion`. Otherwise the client gets 409
  // plus the current copy, merges its edits onto it and retries.
  router.put('/:sheetId', async (req, res) => {
    const existing = await loadAccessibleSheet(authedUserId(req), req.params.sheetId);
    const { data, baseVersion } = updateSheetSchema.parse(req.body);

    // One transaction, so the row we return is the one this write produced, even if
    // another save lands right after.
    const { written, row } = await prisma.$transaction(async (tx) => {
      const { count } = await tx.sheet.updateMany({
        where: { id: existing.id, version: baseVersion },
        data: { data: JSON.stringify(data), version: { increment: 1 } },
      });
      const row = await tx.sheet.findUniqueOrThrow({
        where: { id: existing.id },
        include: sheetInclude,
      });
      return { written: count === 1, row };
    });

    const sheet = toSheet(row);
    if (!written) {
      const body: SheetConflict = { error: 'This sheet was changed by someone else', sheet };
      res.status(409).json(body);
      return;
    }

    realtime.sheetUpdated(sheet);
    res.json({ sheet });
  });

  return router;
};
