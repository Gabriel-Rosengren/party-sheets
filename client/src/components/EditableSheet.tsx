import type { Sheet } from '@party-sheets/shared';
import type { SaveStatus } from '../hooks/useAutosave';
import { useSheetDraft } from '../hooks/useSheetDraft';
import { SheetEditor } from './SheetEditor';

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Editing…',
  saving: 'Saving…',
  error: 'Save failed',
};

/** A sheet editor that autosaves and merges in other people's edits as they arrive. */
export function EditableSheet({ sheet }: { sheet: Sheet }) {
  const { draft, onChange, status, retry } = useSheetDraft(sheet);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3 text-sm" aria-live="polite">
        <span className={status === 'error' ? 'text-red-400' : 'text-stone-400'}>
          {SAVE_LABEL[status]}
        </span>
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
