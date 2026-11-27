import { z } from 'zod';
import { sheetDataSchema, type SheetData } from './sheet';

// ---------- Limits (shared so the client's forms match what the server accepts) ----------

export const PASSWORD_MIN_LENGTH = 8;
export const CAMPAIGN_NAME_LENGTH = { min: 2, max: 60 } as const;
export const INVITE_CODE_LENGTH = 6;

// ---------- Request bodies (validated on the server, reused for client forms) ----------

/** Emails are compared case-insensitively, so they're stored lower-cased. */
const email = z
  .email()
  .max(254)
  .transform((e) => e.toLowerCase());

export const registerSchema = z.object({
  email,
  displayName: z.string().trim().min(2).max(40),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(128),
});
export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.input<typeof loginSchema>;

export const createCampaignSchema = z.object({
  name: z.string().trim().min(CAMPAIGN_NAME_LENGTH.min).max(CAMPAIGN_NAME_LENGTH.max),
});
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;

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
  /** The version this edit is based on. The save is rejected (409) if the sheet moved on. */
  baseVersion: z.number().int().positive(),
});
export type UpdateSheetInput = z.input<typeof updateSheetSchema>;

// ---------- Accounts ----------

/**
 * Several accounts can be signed in on one browser at once (one per tab). Each request
 * names the account it acts as in this header; the server only honours it if the browser
 * also holds a valid session cookie for that account.
 */
export const ACCOUNT_HEADER = 'X-Account';

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
  /**
   * Increments on every save. Saves must name the version they're based on (see
   * `updateSheetSchema`), and clients use it to ignore updates older than what they have.
   */
  version: number;
  data: SheetData;
  updatedAt: string;
}

export interface ApiError {
  error: string;
  issues?: { path: string; message: string }[];
}

/** 409 body from `PUT /api/sheets/:id`: someone saved first, here is their copy. */
export interface SheetConflict extends ApiError {
  sheet: Sheet;
}
