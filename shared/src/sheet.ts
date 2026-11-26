import { z } from 'zod';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const score = z.number().int().min(1).max(30);
const shortText = z.string().max(80);
const longText = z.string().max(10_000);

/**
 * The editable contents of a character sheet. Stored as JSON on the Sheet row so the
 * shape can grow without a migration per field. Every field has a default, which means
 * `sheetDataSchema.parse({})` yields a valid blank sheet.
 */
export const sheetDataSchema = z.object({
  characterName: shortText.default(''),
  className: shortText.default(''),
  level: z.number().int().min(1).max(20).default(1),
  race: shortText.default(''),
  background: shortText.default(''),
  alignment: shortText.default(''),
  experience: z.number().int().min(0).max(1_000_000).default(0),
  abilities: z
    .object({
      str: score.default(10),
      dex: score.default(10),
      con: score.default(10),
      int: score.default(10),
      wis: score.default(10),
      cha: score.default(10),
    })
    .prefault({}),
  hp: z
    .object({
      current: z.number().int().min(-999).max(9999).default(10),
      max: z.number().int().min(0).max(9999).default(10),
      temp: z.number().int().min(0).max(9999).default(0),
    })
    .prefault({}),
  armorClass: z.number().int().min(0).max(50).default(10),
  speed: z.number().int().min(0).max(500).default(30),
  conditions: z.array(shortText).max(20).default([]),
  inventory: longText.default(''),
  notes: longText.default(''),
});

export type SheetData = z.infer<typeof sheetDataSchema>;

export const emptySheetData = (): SheetData => sheetDataSchema.parse({});

export const abilityModifier = (value: number): number => Math.floor((value - 10) / 2);

export const proficiencyBonus = (level: number): number => Math.ceil(level / 4) + 1;

export const formatModifier = (mod: number): string => (mod >= 0 ? `+${mod}` : `${mod}`);

/** Standard 5e conditions, offered as quick toggles in the UI. */
export const CONDITIONS = [
  'Blinded',
  'Charmed',
  'Deafened',
  'Frightened',
  'Grappled',
  'Incapacitated',
  'Invisible',
  'Paralyzed',
  'Petrified',
  'Poisoned',
  'Prone',
  'Restrained',
  'Stunned',
  'Unconscious',
] as const;
