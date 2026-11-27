import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket } from 'socket.io-client';
import { emptySheetData, ACCOUNT_HEADER } from '@party-sheets/shared';
import { createServer } from '../src/server';
import { signSession, sessionCookieName } from '../src/auth/session';
import { PASSWORD, TestBrowser, createCampaign, registerUser, uniqueEmail } from './helpers';
import request from 'supertest';

/**
 * Regression suite for issue #3: several accounts signed in on one browser (one per tab)
 * must never leak into each other. A `TestBrowser` shares one cookie jar between its tabs,
 * which is exactly the situation that used to make every tab switch account.
 */

const { app, httpServer, io } = createServer();
let url = '';
const sockets: Socket[] = [];

beforeAll(async () => {
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${(httpServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  sockets.forEach((s) => s.disconnect());
  await io.close();
});

const connect = (cookie: string, accountId: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = ioClient(url, {
      transports: ['websocket'],
      extraHeaders: { cookie },
      auth: { accountId },
      reconnection: false,
    });
    sockets.push(socket);
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });

const whoAmI = async (browser: TestBrowser, accountId?: string) => {
  const res = await browser.tab(accountId).get('/api/auth/me');
  return res.status === 200 ? (res.body.user.displayName as string) : res.status;
};

describe('several accounts in one browser', () => {
  it('keeps each tab on the account it signed in as (issue #3 repro)', async () => {
    const browser = new TestBrowser(app);
    const a = await browser.signUp('Alpha'); // tab 1
    const b = await browser.signUp('Bravo'); // tab 2, same browser, signs in afterwards

    // Before the fix, tab 1 became Bravo here.
    expect(await whoAmI(browser, a)).toBe('Alpha');
    expect(await whoAmI(browser, b)).toBe('Bravo');
    expect(browser.cookieNames).toEqual(
      expect.arrayContaining([sessionCookieName(a), sessionCookieName(b)]),
    );
  });

  it('acts as the named account for writes too, not the most recent sign-in', async () => {
    const browser = new TestBrowser(app);
    const dmId = await browser.signUp('Warden');
    const dm = browser.tab(dmId);
    const created = await dm.post('/api/campaigns', { name: 'Two Tabs' });
    const campaignId: string = created.body.campaign.id;
    const { body: detail } = await dm.get(`/api/campaigns/${campaignId}`);

    const playerId = await browser.signUp('Squire');
    const player = browser.tab(playerId);
    await player.post('/api/campaigns/join', { inviteCode: detail.campaign.inviteCode });

    // The DM tab still sees the whole party; the player tab only its own sheet.
    expect((await dm.get(`/api/campaigns/${campaignId}/sheets`)).body.sheets).toHaveLength(1);
    const own = await player.get(`/api/campaigns/${campaignId}/sheets`);
    expect(own.body.sheets[0].ownerId).toBe(playerId);
    expect((await dm.get(`/api/campaigns/${campaignId}`)).body.campaign.role).toBe('DM');
    expect((await player.get(`/api/campaigns/${campaignId}`)).body.campaign.role).toBe('PLAYER');

    // A save from the DM tab is the DM's save (the DM may edit), from the player tab the
    // player's. Neither runs as the other account.
    const sheetId: string = own.body.sheets[0].id;
    const data = { ...emptySheetData(), notes: 'from the DM tab' };
    expect((await dm.put(`/api/sheets/${sheetId}`, { data, baseVersion: 1 })).status).toBe(200);
  });

  it('never picks an account implicitly', async () => {
    const browser = new TestBrowser(app);
    const a = await browser.signUp('Implicit');

    // No header: 401 even though the browser holds a valid session.
    expect(await whoAmI(browser)).toBe(401);
    // An account this browser isn't signed in to: 401.
    const stranger = await registerUser(app, 'Stranger');
    expect(await whoAmI(browser, stranger.user.id)).toBe(401);
    // The right header, but the request comes from another browser without the cookie.
    expect(await whoAmI(new TestBrowser(app), a)).toBe(401);
  });

  it("rejects a token filed under another account's cookie name", async () => {
    const victim = await registerUser(app, 'Victim');
    const attacker = await registerUser(app, 'Attacker');
    // Attacker's own valid token, placed where the victim's session would be.
    const forged = `${sessionCookieName(victim.user.id)}=${signSession(attacker.user.id)}`;
    await request(app)
      .get('/api/auth/me')
      .set('Cookie', forged)
      .set(ACCOUNT_HEADER, victim.user.id)
      .expect(401);
  });

  it('lists the signed-in accounts, most recent first', async () => {
    const browser = new TestBrowser(app);
    await browser.signUp('First');
    // iat has one-second resolution; make the order unambiguous.
    await new Promise((r) => setTimeout(r, 1100));
    await browser.signUp('Second');
    const res = await browser.tab().get('/api/auth/accounts');
    expect(res.body.accounts.map((u: { displayName: string }) => u.displayName)).toEqual([
      'Second',
      'First',
    ]);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('signing out one account leaves the other tabs signed in', async () => {
    const browser = new TestBrowser(app);
    const a = await browser.signUp('Leaving');
    const b = await browser.signUp('Staying');

    expect((await browser.tab(a).post('/api/auth/logout')).status).toBe(204);

    expect(await whoAmI(browser, a)).toBe(401);
    expect(await whoAmI(browser, b)).toBe('Staying');
    const accounts = (await browser.tab().get('/api/auth/accounts')).body.accounts;
    expect(accounts.map((u: { id: string }) => u.id)).toEqual([b]);
  });

  it('logging in again as an account keeps the other accounts', async () => {
    const browser = new TestBrowser(app);
    const email = uniqueEmail('Returning');
    const reg = await browser
      .tab()
      .post('/api/auth/register', { email, displayName: 'Returning', password: PASSWORD });
    const a: string = reg.body.user.id;
    const b = await browser.signUp('Other');

    await browser.tab().post('/api/auth/login', { email, password: PASSWORD });
    expect(await whoAmI(browser, a)).toBe('Returning');
    expect(await whoAmI(browser, b)).toBe('Other');
  });

  it('caps the number of accounts per browser, keeping the newest', async () => {
    const browser = new TestBrowser(app);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) ids.push(await browser.signUp(`Crowd${i}`));
    const accounts = (await browser.tab().get('/api/auth/accounts')).body.accounts;
    expect(accounts).toHaveLength(4);
    expect(accounts.map((u: { id: string }) => u.id)).toContain(ids[4]);
  });
});

describe('sockets follow their account and session', () => {
  it('authenticates each socket as the account it names', async () => {
    const browser = new TestBrowser(app);
    const dmId = await browser.signUp('Socket DM');
    const playerId = await browser.signUp('Socket Player');
    const campaign = await createCampaign(
      // createCampaign wants an agent; drive it through a supertest agent with this jar.
      request.agent(app).set('Cookie', browser.cookieHeader).set(ACCOUNT_HEADER, dmId),
    );
    await browser.tab(playerId).post('/api/campaigns/join', { inviteCode: campaign.inviteCode });

    const dmSocket = await connect(browser.cookieHeader, dmId);
    const playerSocket = await connect(browser.cookieHeader, playerId);

    // Only the DM socket may join the DM's view of the campaign, so check both acks.
    const join = (s: Socket) =>
      new Promise<{ ok: boolean }>((r) => s.emit('campaign:join', { campaignId: campaign.id }, r));
    expect(await join(dmSocket)).toEqual({ ok: true });
    expect(await join(playerSocket)).toEqual({ ok: true });

    // A player's save reaches the DM socket but not as a DM event on the player socket.
    const sheets = await browser.tab(playerId).get(`/api/campaigns/${campaign.id}/sheets`);
    const received: string[] = [];
    dmSocket.on('sheet:updated', () => received.push('dm'));
    playerSocket.on('sheet:updated', () => received.push('player'));
    await browser.tab(playerId).put(`/api/sheets/${sheets.body.sheets[0].id}`, {
      data: emptySheetData(),
      baseVersion: 1,
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(received.sort()).toEqual(['dm', 'player']);
  });

  it('closes only the signed-out account’s sockets', async () => {
    const browser = new TestBrowser(app);
    const a = await browser.signUp('Socket Leaver');
    const b = await browser.signUp('Socket Stayer');
    const aSocket = await connect(browser.cookieHeader, a);
    const bSocket = await connect(browser.cookieHeader, b);

    const aClosed = new Promise<string>((r) => aSocket.on('disconnect', r));
    await browser.tab(a).post('/api/auth/logout');

    expect(await aClosed).toBe('io server disconnect');
    await new Promise((r) => setTimeout(r, 100));
    expect(bSocket.connected).toBe(true);

    // And a signed-out account can't reconnect with the cookie gone.
    await expect(connect(browser.cookieHeader, a)).rejects.toThrow('unauthorized');
  });
});
