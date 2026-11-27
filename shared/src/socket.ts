import type { Sheet } from './api';

/**
 * Typed Socket.IO contract shared by the server and the client.
 *
 * Writes go through the REST API (validated, authorised, persisted); the socket layer
 * only fans the resulting state out to the people allowed to see it.
 */

/** Acknowledgement callback: the server's answer to a client event. */
export type Ack = (res: { ok: true } | { ok: false; error: string }) => void;

export interface ClientToServerEvents {
  'campaign:join': (payload: { campaignId: string }, ack: Ack) => void;
  'campaign:leave': (payload: { campaignId: string }) => void;
}

export interface PresenceUpdate {
  campaignId: string;
  /** userIds with at least one open connection to the campaign. */
  online: string[];
}

export interface ServerToClientEvents {
  'sheet:updated': (sheet: Sheet) => void;
  'presence:update': (presence: PresenceUpdate) => void;
  'member:joined': (payload: { campaignId: string; sheet: Sheet }) => void;
}

/** Sent in the Socket.IO handshake: which of the browser's signed-in accounts to use. */
export interface SocketAuth {
  accountId: string;
}

export interface SocketData {
  userId: string;
  /** The JWT id of the session this socket authenticated with. */
  sessionId: string;
}

export const rooms = {
  /** Everyone connected to a campaign — used for presence. */
  campaign: (campaignId: string) => `campaign:${campaignId}`,
  /** The DM's connections only — receives every sheet in the campaign. */
  campaignDm: (campaignId: string) => `campaign:${campaignId}:dm`,
  /** All of one user's connections (e.g. two tabs) — receives their own sheets. */
  user: (userId: string) => `user:${userId}`,
  /** Every connection opened with one login session, so sign-out can close them all. */
  session: (sessionId: string) => `session:${sessionId}`,
};
