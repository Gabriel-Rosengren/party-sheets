import { Server, type Socket } from 'socket.io';
import {
  rooms,
  type ClientToServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@party-sheets/shared';
import { findMembership } from '../access';
import { userIdFromCookieHeader } from '../auth/session';
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

export const createIoServer = (): IoServer =>
  new Server({
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
    // Sheets are small; anything bigger than this is not a legitimate client.
    maxHttpBufferSize: 100_000,
  });

/** Wires authentication, campaign rooms and presence onto the Socket.IO server. */
export const registerSocketHandlers = (io: IoServer): void => {
  // Same session cookie as the REST API; unauthenticated sockets are rejected outright.
  io.use((socket, next) => {
    const userId = userIdFromCookieHeader(socket.handshake.headers.cookie);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  const broadcastPresence = async (campaignId: string) => {
    const sockets = await io.in(rooms.campaign(campaignId)).fetchSockets();
    const online = [...new Set(sockets.map((s) => s.data.userId))];
    io.to(rooms.campaign(campaignId)).emit('presence:update', { campaignId, online });
  };

  io.on('connection', (socket: IoSocket) => {
    const { userId } = socket.data;
    void socket.join(rooms.user(userId));

    socket.on('campaign:join', async ({ campaignId }, ack) => {
      try {
        const membership =
          typeof campaignId === 'string' ? await findMembership(userId, campaignId) : null;
        if (!membership) return ack({ ok: false, error: 'Campaign not found' });

        await socket.join(rooms.campaign(campaignId));
        if (membership.role === 'DM') await socket.join(rooms.campaignDm(campaignId));

        ack({ ok: true });
        await broadcastPresence(campaignId);
      } catch (err) {
        console.error('campaign:join failed', err);
        ack({ ok: false, error: 'Could not join campaign' });
      }
    });

    socket.on('campaign:leave', async ({ campaignId }) => {
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
});
