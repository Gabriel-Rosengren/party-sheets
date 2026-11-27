import { useCallback, useEffect, useRef, useState } from 'react';
import {
  mergeThreeWay,
  sheetDataSchema,
  type Sheet,
  type SheetConflict,
  type SheetData,
} from '@party-sheets/shared';
import { api, ApiRequestError } from '../lib/api';
import { useAutosave } from './useAutosave';

const MAX_CONFLICT_RETRIES = 3;

const isConflict = (err: unknown): err is ApiRequestError & { body: SheetConflict } =>
  err instanceof ApiRequestError && err.status === 409 && !!(err.body as SheetConflict)?.sheet;

/**
 * Local editing state for one sheet that more than one person can edit (its owner and the
 * DM). Edits autosave against the version they're based on. Whenever a newer server copy
 * turns up (a realtime update, or a 409 from a save that lost the race), unsaved local edits
 * are rebased onto it with a three-way merge, so neither person's changes are lost.
 */
export function useSheetDraft(sheet: Sheet) {
  const [draft, setDraftState] = useState<SheetData>(sheet.data);
  const draftRef = useRef(sheet.data);
  /** The server copy the draft is based on. */
  const base = useRef({ version: sheet.version, data: sheet.data });

  const setDraft = (next: SheetData) => {
    draftRef.current = next;
    setDraftState(next);
  };

  const rebase = useCallback((server: Sheet) => {
    if (server.version <= base.current.version) return;
    const merged = mergeThreeWay(base.current.data, draftRef.current, server.data);
    base.current = { version: server.version, data: server.data };
    setDraft(merged);
  }, []);

  const { status, schedule, retry } = useAutosave(async () => {
    for (let attempt = 0; attempt < MAX_CONFLICT_RETRIES; attempt++) {
      const data = draftRef.current;
      try {
        const { sheet: saved } = await api.updateSheet(sheet.id, data, base.current.version);
        // A realtime update may already have moved us past this version.
        if (saved.version > base.current.version) {
          base.current = { version: saved.version, data: saved.data };
        }
        return;
      } catch (err) {
        if (!isConflict(err)) throw err;
        rebase(err.body.sheet);
      }
    }
    throw new Error('Sheet kept changing underneath us; giving up for now');
  });

  // Newer copies arriving via realtime or a refetch.
  useEffect(() => rebase(sheet), [sheet, rebase]);

  const onChange = (next: SheetData) => {
    setDraft(next);
    // Fields only emit in-range values, so this is a belt-and-braces check.
    if (sheetDataSchema.safeParse(next).success) schedule();
  };

  return { draft, onChange, status, retry };
}
