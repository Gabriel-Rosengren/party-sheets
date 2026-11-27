import { describe, expect, it } from 'vitest';
import { mergeThreeWay } from './merge';
import { emptySheetData } from './sheet';

const base = {
  ...emptySheetData(),
  characterName: 'Thia',
  hp: { current: 20, max: 20, temp: 0 },
  conditions: [] as string[],
};

describe('mergeThreeWay', () => {
  it('keeps both sides when they changed different fields', () => {
    const local = { ...base, notes: 'Owes the innkeeper 5gp' };
    const remote = { ...base, conditions: ['Poisoned'] };
    expect(mergeThreeWay(base, local, remote)).toEqual({
      ...base,
      notes: 'Owes the innkeeper 5gp',
      conditions: ['Poisoned'],
    });
  });

  it('merges nested groups key by key', () => {
    const local = { ...base, hp: { ...base.hp, max: 24 } };
    const remote = { ...base, hp: { ...base.hp, current: 7 } };
    expect(mergeThreeWay(base, local, remote).hp).toEqual({ current: 7, max: 24, temp: 0 });
  });

  it('prefers the local edit when both sides changed the same field', () => {
    const local = { ...base, characterName: 'Thia the Bold' };
    const remote = { ...base, characterName: 'Thia the Meek' };
    expect(mergeThreeWay(base, local, remote).characterName).toBe('Thia the Bold');
  });

  it('adopts the remote copy when there are no local edits', () => {
    const remote = { ...base, level: 5, hp: { current: 3, max: 30, temp: 2 } };
    expect(mergeThreeWay(base, base, remote)).toEqual(remote);
  });
});
