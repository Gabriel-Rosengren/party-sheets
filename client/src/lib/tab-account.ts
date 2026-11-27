/**
 * Which account this tab acts as. Kept in sessionStorage, which is per tab and survives a
 * reload, so two tabs can stay signed in as different accounts. Only the user id is
 * stored here; the session token itself stays in an httpOnly cookie that JS can't read.
 */
const KEY = 'party-sheets:account';

// Mirror in memory so the app still works if storage is unavailable (e.g. blocked).
let current: string | null = (() => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
})();

export const tabAccount = {
  get: (): string | null => current,
  set(userId: string) {
    current = userId;
    try {
      sessionStorage.setItem(KEY, userId);
    } catch {
      // Storage unavailable: the in-memory value still covers this page load.
    }
  },
  clear() {
    current = null;
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // Ignore, as above.
    }
  },
};
