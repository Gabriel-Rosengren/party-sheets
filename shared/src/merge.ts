const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Three-way merge used when two people edit the same sheet (the player and their DM).
 *
 * - `base`: the server copy this client last saw
 * - `local`: this client's copy, including edits not yet saved
 * - `remote`: a newer server copy that someone else saved
 *
 * Every value this client changed since `base` is kept; everything else takes the remote
 * value. Objects (abilities, hp) are merged key by key, so a DM lowering current HP and a
 * player raising max HP both survive. Arrays and scalars are compared as whole values: if
 * both sides changed the same one, the local edit wins.
 */
export function mergeThreeWay<T>(base: T, local: T, remote: T): T {
  if (isRecord(base) && isRecord(local) && isRecord(remote)) {
    const merged: Record<string, unknown> = { ...remote };
    for (const key of Object.keys(local)) {
      merged[key] = mergeThreeWay(base[key], local[key], remote[key]);
    }
    return merged as T;
  }
  return same(local, base) ? remote : local;
}
