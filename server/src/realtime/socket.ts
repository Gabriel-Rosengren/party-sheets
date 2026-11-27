import { parse as parseCookie } from 'cookie';
import { Server, type Socket } from 'socket.io';
import {
  rooms,
  type Ack,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@party-sheets/shared';
import { findMembership } from '../access';
import { sessionForAccount } from '../auth/session';
import { env } from '../env';
import type { RealtimeNotifier } from './notifier';

export type IoServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type IoSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

const CAMPAIGN_ROOM = /^campaign:([^:]+)$/;

/** The `campaignId` of a `{ campaignId }` payload, or null if the payload isn't one. */
const campaignIdOf = (payload: unknown): string | null =>
  typeof payload === 'object' &&
  payload !== null &&
  'campaignId' in payload &&
  typeof payload.campaignId === 'string'
    ? payload.campaignId
    : null;

export const createIoServer = (): IoServer =>
  new Server({
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    // Sheets are small; anything bigger than this is not a legitimate client.
    maxHttpBufferSize: 100_000,
  });

/** Wires authentication, campaign rooms and presence onto the Socket.IO server. */
export const registerSocketHandlers = (io: IoServer): void => {
  // Same rule as the REST API: the handshake names an account (`auth.accountId`) and the
  // browser must hold a valid session cookie for it. Anything else is rejected outright.
  io.use(async (socket, next) => {
    try {
      const auth: unknown = socket.handshake.auth;
      const accountId =
        typeof auth === 'object' && auth !== null && 'accountId' in auth ? auth.accountId : null;
      const session =
        typeof accountId === 'string'
          ? await sessionForAccount(parseCookie(socket.handshake.headers.cookie ?? ''), accountId)
          : null;
      if (!session) return next(new Error('unauthorized'));
      socket.data.userId = session.userId;
      socket.data.sessionId = session.sessionId;
      next();
    } catch (err) {
      // Same rule as the event handlers: never let a rejection escape and crash the server.
      console.error('socket auth failed', err);
      next(new Error('unauthorized'));
    }
  });

  /** Tells everyone in a campaign who is connected. Never throws: presence is best effort. */
  const broadcastPresence = async (campaignId: string) => {
    try {
      const sockets = await io.in(rooms.campaign(campaignId)).fetchSockets();
      const online = [...new Set(sockets.map((s) => s.data.userId))];
      io.to(rooms.campaign(campaignId)).emit('presence:update', { campaignId, online });
    } catch (err) {
      console.error('presence broadcast failed', err);
    }
  };

  io.on('connection', (socket: IoSocket) => {
    const { userId } = socket.data;
    void socket.join([rooms.user(userId), rooms.session(socket.data.sessionId)]);

    // Event arguments come straight from the client and may be anything, so they're typed
    // `unknown` and checked here. A throw inside an async handler would be an unhandled
    // rejection, which crashes the whole server.
    socket.on('campaign:join', async (payload: unknown, ack: unknown) => {
      const reply: Ack = typeof ack === 'function' ? (ack as Ack) : () => {};
      try {
        const campaignId = campaignIdOf(payload);
        const membership = campaignId ? await findMembership(userId, campaignId) : null;
        if (!campaignId || !membership) return reply({ ok: false, error: 'Campaign not found' });

        await socket.join(rooms.campaign(campaignId));
        if (membership.role === 'DM') await socket.join(rooms.campaignDm(campaignId));

        reply({ ok: true });
        await broadcastPresence(campaignId);
      } catch (err) {
        console.error('campaign:join failed', err);
        reply({ ok: false, error: 'Could not join campaign' });
      }
    });

    socket.on('campaign:leave', async (payload: unknown) => {
      const campaignId = campaignIdOf(payload);
      if (!campaignId || !socket.rooms.has(rooms.campaign(campaignId))) return;
      await socket.leave(rooms.campaign(campaignId));
      await socket.leave(rooms.campaignDm(campaignId));
      await broadcastPresence(campaignId);
    });

    // Rooms are already emptied by the time 'disconnect' fires, so note them first.
    let campaignsOnDisconnect: string[] = [];
    socket.on('disconnecting', () => {
      campaignsOnDisconnect = [...socket.rooms].flatMap((r) => CAMPAIGN_ROOM.exec(r)?.[1] ?? []);
    });
    socket.on('disconnect', () => {
      for (const campaignId of campaignsOnDisconnect) void broadcastPresence(campaignId);
    });
  });
};

/**
 * Fan-out rules: a sheet goes to its owner's own connections (other tabs/devices) and to
 * the campaign DM. Other players never receive each other's sheets.
 */
export const socketNotifier = (io: IoServer): RealtimeNotifier => ({
  sheetUpdated(sheet) {
    io.to([rooms.user(sheet.ownerId), rooms.campaignDm(sheet.campaignId)]).emit(
      'sheet:updated',
      sheet,
    );
  },
  memberJoined(campaignId, sheet) {
    io.to(rooms.campaignDm(campaignId)).emit('member:joined', { campaignId, sheet });
  },
  sessionEnded(sessionId) {
    io.in(rooms.session(sessionId)).disconnectSockets(true);
  },
});
