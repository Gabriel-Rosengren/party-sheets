import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { emptySheetData } from '@party-sheets/shared';
import { createServer } from '../src/server';
import { createCampaign, registerUser } from './helpers';

const { app } = createServer();

describe('auth', () => {
  it('registers, reads the session, logs out and logs back in', async () => {
    const { agent, email } = await registerUser(app, 'Aria');

    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ email, displayName: 'Aria' });
    expect(me.body.user.passwordHash).toBeUndefined();

    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);

    await agent
      .post('/api/auth/login')
      .send({ email: email.toUpperCase(), password: 'correct horse battery' })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);
  });

  it('rejects a wrong password and a duplicate email', async () => {
    const { email } = await registerUser(app, 'Bram');
    await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'wrong password' })
      .expect(401);
    await request(app)
      .post('/api/auth/register')
      .send({ email, displayName: 'Bram again', password: 'another password' })
      .expect(409);
  });

  it('returns field-level validation errors', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', displayName: 'X', password: 'short' })
      .expect(400);
    const paths = res.body.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['email', 'displayName', 'password']));
  });

  it('requires a session for campaign routes', async () => {
    await request(app).get('/api/campaigns').expect(401);
  });
});

describe('campaigns and sheets', () => {
  it('lets a player join by code and keeps sheets scoped to owner + DM', async () => {
    const dm = await registerUser(app, 'Dungeon');
    const p1 = await registerUser(app, 'Player1');
    const p2 = await registerUser(app, 'Player2');
    const outsider = await registerUser(app, 'Outsider');

    const campaign = await createCampaign(dm.agent);
    expect(campaign.inviteCode).toMatch(/^[A-Z0-9]{6}$/);

    // Codes are case-insensitive; re-joining is idempotent.
    const join = await p1.agent
      .post('/api/campaigns/join')
      .send({ inviteCode: campaign.inviteCode.toLowerCase() })
      .expect(201);
    expect(join.body.alreadyMember).toBe(false);
    await p1.agent
      .post('/api/campaigns/join')
      .send({ inviteCode: campaign.inviteCode })
      .expect(200);
    await p2.agent.post('/api/campaigns/join').send({ inviteCode: campaign.inviteCode });

    // Players don't see the invite code; the DM does.
    const p1Detail = await p1.agent.get(`/api/campaigns/${campaign.id}`).expect(200);
    expect(p1Detail.body.campaign.role).toBe('PLAYER');
    expect(p1Detail.body.campaign.inviteCode).toBeUndefined();
    expect(p1Detail.body.campaign.members).toHaveLength(3);

    // DM sees every sheet, players only their own, outsiders nothing.
    const dmSheets = await dm.agent.get(`/api/campaigns/${campaign.id}/sheets`).expect(200);
    expect(dmSheets.body.sheets).toHaveLength(2);
    const p1Sheets = await p1.agent.get(`/api/campaigns/${campaign.id}/sheets`).expect(200);
    expect(p1Sheets.body.sheets).toHaveLength(1);
    expect(p1Sheets.body.sheets[0].ownerId).toBe(p1.user.id);
    await outsider.agent.get(`/api/campaigns/${campaign.id}/sheets`).expect(404);

    const p1SheetId: string = p1Sheets.body.sheets[0].id;
    await p2.agent.get(`/api/sheets/${p1SheetId}`).expect(404);
    await dm.agent.get(`/api/sheets/${p1SheetId}`).expect(200);

    // Only the owner can write; versions increment.
    const data = { ...emptySheetData(), characterName: 'Thia', level: 3 };
    await p2.agent.put(`/api/sheets/${p1SheetId}`).send({ data, baseVersion: 1 }).expect(404);
    const saved = await p1.agent
      .put(`/api/sheets/${p1SheetId}`)
      .send({ data, baseVersion: 1 })
      .expect(200);
    expect(saved.body.sheet.version).toBe(2);
    expect(saved.body.sheet.data).toMatchObject({ characterName: 'Thia', level: 3 });

    // Invalid sheet data, or a missing base version, is rejected.
    await p1.agent
      .put(`/api/sheets/${p1SheetId}`)
      .send({ data: { ...data, level: 99 }, baseVersion: 2 })
      .expect(400);
    await p1.agent.put(`/api/sheets/${p1SheetId}`).send({ data }).expect(400);
  });

  it('lets the DM edit any sheet in their campaign, but not other campaigns', async () => {
    const dm = await registerUser(app, 'Keeper');
    const player = await registerUser(app, 'Fighter');
    const otherDm = await registerUser(app, 'Rival');
    const campaign = await createCampaign(dm.agent);
    await createCampaign(otherDm.agent);
    await player.agent.post('/api/campaigns/join').send({ inviteCode: campaign.inviteCode });

    const { body } = await player.agent.get(`/api/campaigns/${campaign.id}/sheets`);
    const sheetId: string = body.sheets[0].id;
    const data = { ...emptySheetData(), hp: { current: 3, max: 12, temp: 0 } };

    // A DM of a different campaign gets a 404, the same as any outsider.
    await otherDm.agent.put(`/api/sheets/${sheetId}`).send({ data, baseVersion: 1 }).expect(404);

    const saved = await dm.agent
      .put(`/api/sheets/${sheetId}`)
      .send({ data, baseVersion: 1 })
      .expect(200);
    expect(saved.body.sheet).toMatchObject({ version: 2, ownerName: 'Fighter' });

    // The player sees the DM's change, and the sheet still belongs to them.
    const mine = await player.agent.get(`/api/sheets/${sheetId}`).expect(200);
    expect(mine.body.sheet).toMatchObject({ ownerId: player.user.id, version: 2 });
    expect(mine.body.sheet.data.hp.current).toBe(3);
  });

  it('rejects a save based on a stale version and returns the current copy', async () => {
    const dm = await registerUser(app, 'Arbiter');
    const player = await registerUser(app, 'Wizard');
    const campaign = await createCampaign(dm.agent);
    await player.agent.post('/api/campaigns/join').send({ inviteCode: campaign.inviteCode });
    const { body } = await player.agent.get(`/api/campaigns/${campaign.id}/sheets`);
    const sheetId: string = body.sheets[0].id;

    // Both start from version 1. The DM saves first.
    await dm.agent
      .put(`/api/sheets/${sheetId}`)
      .send({ data: { ...emptySheetData(), conditions: ['Poisoned'] }, baseVersion: 1 })
      .expect(200);

    // The player's save, still based on version 1, must not overwrite the DM's edit.
    const conflict = await player.agent
      .put(`/api/sheets/${sheetId}`)
      .send({ data: { ...emptySheetData(), notes: 'Found a key' }, baseVersion: 1 })
      .expect(409);
    expect(conflict.body.sheet).toMatchObject({ version: 2, data: { conditions: ['Poisoned'] } });

    // Retrying on top of the current version succeeds.
    await player.agent
      .put(`/api/sheets/${sheetId}`)
      .send({
        data: { ...conflict.body.sheet.data, notes: 'Found a key' },
        baseVersion: 2,
      })
      .expect(200);
    const final = await dm.agent.get(`/api/sheets/${sheetId}`).expect(200);
    expect(final.body.sheet).toMatchObject({
      version: 3,
      data: { conditions: ['Poisoned'], notes: 'Found a key' },
    });
  });

  it('lists campaigns with the caller role', async () => {
    const dm = await registerUser(app, 'Lister');
    await createCampaign(dm.agent, 'Curse of Strahd');
    const res = await dm.agent.get('/api/campaigns').expect(200);
    expect(res.body.campaigns).toEqual([
      expect.objectContaining({ name: 'Curse of Strahd', role: 'DM', memberCount: 1 }),
    ]);
  });

  it('404s on an unknown invite code', async () => {
    const p = await registerUser(app, 'Lost');
    await p.agent.post('/api/campaigns/join').send({ inviteCode: 'ZZZZZZ' }).expect(404);
  });
});
