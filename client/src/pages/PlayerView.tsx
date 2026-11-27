import type { Sheet } from '@party-sheets/shared';
import { EditableSheet } from '../components/EditableSheet';

export function PlayerView({ sheet }: { sheet: Sheet | undefined }) {
  if (!sheet) {
    return <p className="card p-6 text-stone-400">No sheet found for you in this campaign.</p>;
  }
  return <EditableSheet sheet={sheet} />;
}
