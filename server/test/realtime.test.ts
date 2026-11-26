import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import {
  emptySheetData,
  type ClientToServerEvents,
  type Sheet,
  type ServerToClientEvents,
} from '@party-sheets/shared';
import { createServer } from '../src/server';
import { createCampaign, registerUser } from './helpers';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const { app, httpServer, io } = createServer();
let url = '';
const sockets: ClientSocket[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await io.close();
});

const connect = (cookie?: string) =>
  new Promise<ClientSocket>((resolve, reject) => {
    const socket: ClientSocket = ioClient(url, {
      transports: ['websocket'],
      extraHeaders: cookie ? { cookie } : {},
      reconnection: false,
    });
    sockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

const joinRoom = (socket: ClientSocket, campaignId: string) =>
  new Promise<void>((resolve, reject) =>
    socket.emit('campaign:join', { campaignId }, (res) =>
      res.ok ? resolve() : reject(new Error(res.error)),
    ),
  );

const nextEvent = <E extends keyof ServerToClientEvents>(socket: ClientSocket, event: E) =>
  new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
    socket.once(event, ((payload: Parameters<ServerToClientEvents[E]>[0]) =>
      resolve(payload)) as never);
  });

describe('realtime sheet sharing', () => {
  it('rejects sockets without a valid session', async () => {
    await expect(connect()).rejects.toThrow('unauthorized');
    await expect(connect('ps_session=garbage')).rejects.toThrow('unauthorized');
  });

  it('streams a player sheet update to the DM but not to other players', async () => {
    const dm = await registerUser(app, 'DM');
    const p1 = await registerUser(app, 'Rogue');
    const p2 = await registerUser(app, 'Cleric');
    const outsider = await registerUser(app, 'Spy');
    const campaign = await createCampaign(dm.agent);

    const dmSocket = await connect(dm.cookie);
    await joinRoom(dmSocket, campaign.id);

    // The DM is told about new members as they join.
    const joined = nextEvent(dmSocket, 'member:joined');
    await p1.agent.post('/api/campaigns/join').send({ inviteCode: campaign.inviteCode });
    expect((await joined).sheet.ownerName).toBe('Rogue');
    await p2.agent.post('/api/campaigns/join').send({ inviteCode: campaign.inviteCode });

    const p2Socket = await connect(p2.cookie);
    await joinRoom(p2Socket, campaign.id);

    // Non-members can't subscribe to the campaign.
    const outsiderSocket = await connect(outsider.cookie);
    await expect(joinRoom(outsiderSocket, campaign.id)).rejects.toThrow('Campaign not found');

    const leaked: Sheet[] = [];
    p2Socket.on('sheet:updated', (s) => leaked.push(s));
    outsiderSocket.on('sheet:updated', (s) => leaked.push(s));

    const sheets = await p1.agent.get(`/api/campaigns/${campaign.id}/sheets`);
    const sheetId: string = sheets.body.sheets[0].id;

    const received = nextEvent(dmSocket, 'sheet:updated');
    await p1.agent
      .put(`/api/sheets/${sheetId}`)
      .send({ data: { ...emptySheetData(), characterName: 'Vex', hp: { current: 4, max: 12, temp: 0 } } })
      .expect(200);

    const update = await received;
    expect(update).toMatchObject({ id: sheetId, version: 2, ownerName: 'Rogue' });
    expect(update.data.hp.current).toBe(4);

    // Give any wrongly-routed event a moment to arrive before asserting none did.
    await new Promise((r) => setTimeout(r, 100));
    expect(leaked).toEqual([]);
  });

  it('broadcasts presence as members connect and disconnect', async () => {
    const dm = await registerUser(app, 'Host');
    const p1 = await registerUser(app, 'Bard');
    const campaign = await createCampaign(dm.agent);
    await p1.agent.post('/api/campaigns/join').send({ inviteCode: campaign.inviteCode });

    const dmSocket = await connect(dm.cookie);
    await joinRoom(dmSocket, campaign.id);

    const online = nextEvent(dmSocket, 'presence:update');
    const p1Socket = await connect(p1.cookie);
    await joinRoom(p1Socket, campaign.id);
    expect((await online).online.sort()).toEqual([dm.user.id, p1.user.id].sort());

    const offline = nextEvent(dmSocket, 'presence:update');
    p1Socket.disconnect();
    expect((await offline).online).toEqual([dm.user.id]);
  });
});
