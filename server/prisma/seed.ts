/**
 * Demo data for local development and screen-share demos. Idempotent: safe to re-run.
 *
 *   npm run db:seed -w server
 *
 * All demo accounts use the password below. Never run this against a real database.
 */
import bcrypt from 'bcryptjs';
import { emptySheetData, type SheetData } from '@party-sheets/shared';
import { prisma } from '../src/db';

const DEMO_PASSWORD = 'demo-password-123';
const DEMO_INVITE_CODE = 'KRAKEN';

const dm = { email: 'dm@demo.test', displayName: 'Morgan (DM)' };

const players: { email: string; displayName: string; sheet: Partial<SheetData> }[] = [
  {
    email: 'aria@demo.test',
    displayName: 'Aria',
    sheet: {
      characterName: 'Thia Brightwater',
      className: 'Rogue',
      race: 'Half-elf',
      level: 3,
      background: 'Urchin',
      alignment: 'Chaotic good',
      abilities: { str: 10, dex: 17, con: 12, int: 13, wis: 11, cha: 14 },
      hp: { current: 19, max: 24, temp: 0 },
      armorClass: 15,
      inventory: 'Shortsword, shortbow (20 arrows), thieves’ tools, 34 gp',
    },
  },
  {
    email: 'bram@demo.test',
    displayName: 'Bram',
    sheet: {
      characterName: 'Durgan Ironfist',
      className: 'Fighter',
      race: 'Mountain dwarf',
      level: 3,
      background: 'Soldier',
      alignment: 'Lawful neutral',
      abilities: { str: 17, dex: 10, con: 16, int: 9, wis: 12, cha: 8 },
      hp: { current: 31, max: 31, temp: 5 },
      armorClass: 18,
      speed: 25,
      inventory: 'Battleaxe, shield, chain mail, 12 gp',
    },
  },
  {
    email: 'cyd@demo.test',
    displayName: 'Cyd',
    sheet: {
      characterName: 'Ilyra Vey',
      className: 'Wizard',
      race: 'High elf',
      level: 3,
      background: 'Sage',
      alignment: 'Neutral good',
      abilities: { str: 8, dex: 14, con: 13, int: 17, wis: 12, cha: 10 },
      hp: { current: 6, max: 17, temp: 0 },
      armorClass: 12,
      conditions: ['Poisoned'],
      notes: 'Spellbook: magic missile, shield, misty step, detect magic',
    },
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const upsertUser = ({ email, displayName }: { email: string; displayName: string }) =>
    prisma.user.upsert({
      where: { email },
      update: { displayName, passwordHash },
      create: { email, displayName, passwordHash },
    });

  const dmUser = await upsertUser(dm);
  const campaign = await prisma.campaign.upsert({
    where: { inviteCode: DEMO_INVITE_CODE },
    update: {},
    create: { name: 'Lost Mine of the Kraken', inviteCode: DEMO_INVITE_CODE, dmId: dmUser.id },
  });
  await prisma.membership.upsert({
    where: { userId_campaignId: { userId: dmUser.id, campaignId: campaign.id } },
    update: {},
    create: { userId: dmUser.id, campaignId: campaign.id, role: 'DM' },
  });

  for (const p of players) {
    const user = await upsertUser(p);
    await prisma.membership.upsert({
      where: { userId_campaignId: { userId: user.id, campaignId: campaign.id } },
      update: {},
      create: { userId: user.id, campaignId: campaign.id, role: 'PLAYER' },
    });
    const data = JSON.stringify({ ...emptySheetData(), ...p.sheet });
    await prisma.sheet.upsert({
      where: { campaignId_ownerId: { campaignId: campaign.id, ownerId: user.id } },
      update: { data, version: { increment: 1 } },
      create: { campaignId: campaign.id, ownerId: user.id, data },
    });
  }

  console.log(`Seeded "${campaign.name}" (invite code ${DEMO_INVITE_CODE}).`);
  console.log(`Sign in as ${dm.email} or ${players.map((p) => p.email).join(', ')}`);
  console.log(`Password for all demo accounts: ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
