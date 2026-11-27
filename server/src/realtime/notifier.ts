import type { Sheet } from '@party-sheets/shared';

/**
 * What the HTTP layer needs from the realtime layer. Routes depend on this interface
 * rather than on Socket.IO directly, which keeps them testable and transport-agnostic.
 */
export interface RealtimeNotifier {
  sheetUpdated(sheet: Sheet): void;
  memberJoined(campaignId: string, sheet: Sheet): void;
  /** A login session was signed out: close every socket that authenticated with it. */
  sessionEnded(sessionId: string): void;
}
