import { randomUUID } from 'node:crypto';
import type { Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { io as ioClient, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll } from 'vitest';
import {
  ACCOUNT_HEADER,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@party-sheets/shared';
import type { IoServer } from '../src/realtime/socket';

export const PASSWORD = 'correct horse battery';
export const uniqueEmail = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID()}@example.com`;

/**
 * Registers a fresh user and returns an agent that carries their session cookie and names
 * their account on every request, like a browser tab signed in as them.
 */
export const registerUser = async (app: Express, displayName = 'Tester') => {
  const agent = request.agent(app);
  const email = uniqueEmail(displayName);
  const res = await agent
    .post('/api/auth/register')
    .send({ email, displayName, password: PASSWORD })
    .expect(201);
  const cookie = [res.headers['set-cookie']].flat().join('; ');
  agent.set(ACCOUNT_HEADER, res.body.user.id);
  return { agent, email, user: res.body.user as { id: string }, cookie };
};

/** DM creates a campaign; returns its id and invite code. */
export const createCampaign = async (dm: request.Agent, name = 'Lost Mine') => {
  const created = await dm.post('/api/campaigns').send({ name }).expect(201);
  const id: string = created.body.campaign.id;
  const detail = await dm.get(`/api/campaigns/${id}`).expect(200);
  return { id, inviteCode: detail.body.campaign.inviteCode as string };
};

/** Joins a campaign as a player; returns the id of the sheet that joining creates. */
export const joinCampaign = async (player: request.Agent, inviteCode: string) => {
  const joined = await player.post('/api/campaigns/join').send({ inviteCode }).expect(201);
  const { body } = await player.get(`/api/campaigns/${joined.body.campaign.id}/sheets`).expect(200);
  return body.sheets[0].id as string;
};

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Starts the server on a free port for the calling test file and returns `connect`, which
 * opens a socket the way a tab does: with the browser's cookies and the account it acts
 * as. Every socket is closed, and the server stopped, when the file's tests finish.
 */
export const listenForSockets = ({ httpServer, io }: { httpServer: HttpServer; io: IoServer }) => {
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

  return (cookie?: string, accountId?: string) =>
    new Promise<ClientSocket>((resolve, reject) => {
      const socket: ClientSocket = ioClient(url, {
        transports: ['websocket'],
        extraHeaders: cookie ? { cookie } : {},
        auth: accountId ? { accountId } : {},
        reconnection: false,
      });
      sockets.push(socket);
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
};

type Body = Record<string, unknown>;

/**
 * One browser: a single cookie jar shared by all of its tabs, exactly like the real thing.
 * Each tab names the account it acts as, the way the client's per-tab account does.
 */
export class TestBrowser {
  private readonly cookies = new Map<string, string>();

  constructor(private readonly app: Express) {}

  /** The Cookie header this browser would send (also used for socket handshakes). */
  get cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  get cookieNames(): string[] {
    return [...this.cookies.keys()];
  }

  /** A tab acting as `accountId`, or as nobody in particular if omitted. */
  tab(accountId?: string) {
    const send = async (method: 'get' | 'post' | 'put', path: string, body?: Body) => {
      let req = request(this.app)[method](path);
      if (this.cookies.size) req = req.set('Cookie', this.cookieHeader);
      if (accountId) req = req.set(ACCOUNT_HEADER, accountId);
      const res = await (body ? req.send(body) : req);
      this.store(res);
      return res;
    };
    return {
      get: (path: string) => send('get', path),
      post: (path: string, body?: Body) => send('post', path, body),
      put: (path: string, body?: Body) => send('put', path, body),
    };
  }

  /** Signs in from a fresh tab and returns the account id. */
  async signUp(displayName: string): Promise<string> {
    const res = await this.tab().post('/api/auth/register', {
      email: uniqueEmail(displayName),
      displayName,
      password: PASSWORD,
    });
    if (res.status !== 201) throw new Error(`register failed: ${res.status}`);
    return res.body.user.id as string;
  }

  private store(res: request.Response) {
    for (const line of [res.headers['set-cookie'] ?? []].flat()) {
      const [pair = '', ...attrs] = line.split(';').map((p) => p.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const expired = attrs.some((a) => {
        const [key = '', val = ''] = a.split('=');
        return key.toLowerCase() === 'expires' && new Date(val).getTime() <= Date.now();
      });
      if (expired || !value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}
