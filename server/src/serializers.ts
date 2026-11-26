import { sheetDataSchema, type PublicUser, type Sheet } from '@party-sheets/shared';
import type { Sheet as SheetRow, User } from './generated/prisma/client';

export const toPublicUser = (u: Pick<User, 'id' | 'email' | 'displayName'>): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
});

export const toSheet = (row: SheetRow & { owner: Pick<User, 'displayName'> }): Sheet => ({
  id: row.id,
  campaignId: row.campaignId,
  ownerId: row.ownerId,
  ownerName: row.owner.displayName,
  version: row.version,
  // Parsing (not just JSON.parse) back-fills any fields added to the schema since save.
  data: sheetDataSchema.parse(JSON.parse(row.data)),
  updatedAt: row.updatedAt.toISOString(),
});

export const sheetInclude = { owner: { select: { displayName: true } } } as const;
