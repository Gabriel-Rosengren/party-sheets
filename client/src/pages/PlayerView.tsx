import { useEffect, useRef, useState } from 'react';
import { sheetDataSchema, type Sheet, type SheetData } from '@party-sheets/shared';
import { api } from '../lib/api';
import { useAutosave, type SaveStatus } from '../hooks/useAutosave';
import { SheetEditor } from '../components/SheetEditor';

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Editing…',
  saving: 'Saving…',
  error: 'Save failed',
};

export function PlayerView({ sheet }: { sheet: Sheet | undefined }) {
  if (!sheet) {
    return <p className="card p-6 text-stone-400">No sheet found for you in this campaign.</p>;
  }
  return <PlayerSheet sheet={sheet} />;
}

function PlayerSheet({ sheet }: { sheet: Sheet }) {
  const [draft, setDraft] = useState<SheetData>(sheet.data);
  /** Version of the server copy our draft is based on. */
  const baseVersion = useRef(sheet.version);

  const { status, schedule, retry } = useAutosave<SheetData>(async (data) => {
    const { sheet: saved } = await api.updateSheet(sheet.id, data);
    baseVersion.current = saved.version;
  });

  // A newer version from elsewhere (e.g. this player's other tab): adopt it, but never
  // clobber edits that haven't been saved yet.
  useEffect(() => {
    if (sheet.version > baseVersion.current && status === 'saved') {
      baseVersion.current = sheet.version;
      setDraft(sheet.data);
    }
  }, [sheet, status]);

  const onChange = (next: SheetData) => {
    setDraft(next);
    // Fields only emit in-range values, so this is a belt-and-braces check.
    if (sheetDataSchema.safeParse(next).success) schedule(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3 text-sm" aria-live="polite">
        <span className={status === 'error' ? 'text-red-400' : 'text-stone-400'}>{SAVE_LABEL[status]}</span>
        {status === 'error' && (
          <button type="button" className="btn btn-ghost py-1" onClick={retry}>
            Retry
          </button>
        )}
      </div>
      <SheetEditor data={draft} onChange={onChange} />
    </div>
  );
}
