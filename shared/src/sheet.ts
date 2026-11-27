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

export interface IntRange {
  min: number;
  max: number;
}

/**
 * Allowed values for sheet fields. The schema below validates against these, and the
 * editor's inputs use the same numbers, so the two can't drift apart.
 */
export const SHEET_LIMITS = {
  shortTextLength: 80,
  longTextLength: 10_000,
  maxConditions: 20,
  level: { min: 1, max: 20 },
  experience: { min: 0, max: 1_000_000 },
  abilityScore: { min: 1, max: 30 },
  currentHp: { min: -999, max: 9999 },
  maxHp: { min: 0, max: 9999 },
  tempHp: { min: 0, max: 9999 },
  armorClass: { min: 0, max: 50 },
  speed: { min: 0, max: 500 },
} as const satisfies Record<string, number | IntRange>;

const int = ({ min, max }: IntRange) => z.number().int().min(min).max(max);
const abilityScore = int(SHEET_LIMITS.abilityScore);
const shortText = z.string().max(SHEET_LIMITS.shortTextLength);
const longText = z.string().max(SHEET_LIMITS.longTextLength);

/**
 * The editable contents of a character sheet. Stored as JSON on the Sheet row so the
 * shape can grow without a migration per field. Every field has a default, which means
 * `sheetDataSchema.parse({})` yields a valid blank sheet.
 */
export const sheetDataSchema = z.object({
  characterName: shortText.default(''),
  className: shortText.default(''),
  level: int(SHEET_LIMITS.level).default(1),
  race: shortText.default(''),
  background: shortText.default(''),
  alignment: shortText.default(''),
  experience: int(SHEET_LIMITS.experience).default(0),
  abilities: z
    .object({
      str: abilityScore.default(10),
      dex: abilityScore.default(10),
      con: abilityScore.default(10),
      int: abilityScore.default(10),
      wis: abilityScore.default(10),
      cha: abilityScore.default(10),
    })
    .prefault({}),
  hp: z
    .object({
      current: int(SHEET_LIMITS.currentHp).default(10),
      max: int(SHEET_LIMITS.maxHp).default(10),
      temp: int(SHEET_LIMITS.tempHp).default(0),
    })
    .prefault({}),
  armorClass: int(SHEET_LIMITS.armorClass).default(10),
  speed: int(SHEET_LIMITS.speed).default(30),
  conditions: z.array(shortText).max(SHEET_LIMITS.maxConditions).default([]),
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
