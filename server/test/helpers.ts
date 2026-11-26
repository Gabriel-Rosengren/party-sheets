import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

/** Registers a fresh user and returns an agent that carries their session cookie. */
export const registerUser = async (app: Express, displayName = 'Tester') => {
  const agent = request.agent(app);
  const email = `${displayName.toLowerCase()}-${randomUUID()}@example.com`;
  const res = await agent
    .post('/api/auth/register')
    .send({ email, displayName, password: 'correct horse battery' })
    .expect(201);
  const cookie = [res.headers['set-cookie']].flat().join('; ');
  return { agent, email, user: res.body.user as { id: string }, cookie };
};

/** DM creates a campaign; returns its id and invite code. */
export const createCampaign = async (dm: request.Agent, name = 'Lost Mine') => {
  const created = await dm.post('/api/campaigns').send({ name }).expect(201);
  const id: string = created.body.campaign.id;
  const detail = await dm.get(`/api/campaigns/${id}`).expect(200);
  return { id, inviteCode: detail.body.campaign.inviteCode as string };
};
