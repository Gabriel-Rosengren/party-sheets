import { randomInt } from 'node:crypto';
import { INVITE_CODE_LENGTH } from '@party-sheets/shared';

// No 0/O or 1/I/L, so codes survive being read aloud at the table.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export const generateInviteCode = (): string =>
  Array.from({ length: INVITE_CODE_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
