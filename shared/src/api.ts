import { z } from 'zod';
import { sheetDataSchema, type SheetData } from './sheet';

// ---------- Request bodies (validated on the server, reused for client forms) ----------

export const registerSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((e) => e.toLowerCase()),
  displayName: z.string().trim().min(2).max(40),
  password: z.string().min(8).max(128),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(2).max(60),
});
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;

export const INVITE_CODE_LENGTH = 6;

export const joinCampaignSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .toUpperCase()
    .length(INVITE_CODE_LENGTH, `Invite codes are ${INVITE_CODE_LENGTH} characters`),
});
export type JoinCampaignInput = z.input<typeof joinCampaignSchema>;

export const updateSheetSchema = z.object({
  data: sheetDataSchema,
});
export type UpdateSheetInput = z.input<typeof updateSheetSchema>;

// ---------- Response shapes ----------

export type Role = 'DM' | 'PLAYER';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
}

export interface CampaignSummary {
  id: string;
  name: string;
  role: Role;
  dmName: string;
  memberCount: number;
  createdAt: string;
}

export interface CampaignMember {
  userId: string;
  displayName: string;
  role: Role;
}

export interface CampaignDetail {
  id: string;
  name: string;
  role: Role;
  /** Only present for the DM, who hands it out to players. */
  inviteCode?: string;
  members: CampaignMember[];
}

export interface Sheet {
  id: string;
  campaignId: string;
  ownerId: string;
  ownerName: string;
  /** Increments on every save; clients use it to drop out-of-order updates. */
  version: number;
  data: SheetData;
  updatedAt: string;
}

export interface ApiError {
  error: string;
  issues?: { path: string; message: string }[];
}
