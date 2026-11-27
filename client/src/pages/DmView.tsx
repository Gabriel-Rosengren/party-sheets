import { useState } from 'react';
import type { CampaignDetail, Sheet } from '@party-sheets/shared';
import { SheetCard } from '../components/SheetCard';
import { EditableSheet } from '../components/EditableSheet';

interface Props {
  campaign: CampaignDetail;
  sheets: Sheet[];
  online: string[];
}

function InviteCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context); the code is visible anyway.
    }
  };
  return (
    <div className="card flex flex-wrap items-center gap-4 p-4">
      <div>
        <div className="label">Invite code</div>
        <div className="font-mono text-2xl tracking-[0.3em] text-amber-300">{code}</div>
      </div>
      <button type="button" className="btn btn-ghost" onClick={() => void copy()}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <p className="text-sm text-stone-400 sm:ml-auto sm:max-w-xs">
        Players sign up, choose “Join a party” and enter this code. Their sheet appears here
        instantly.
      </p>
    </div>
  );
}

export function DmView({ campaign, sheets, online }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sheets.find((s) => s.id === selectedId) ?? null;
  const onlineSet = new Set(online);

  return (
    <div className="space-y-6">
      {campaign.inviteCode && <InviteCode code={campaign.inviteCode} />}

      <section>
        <h2 className="mb-3 font-display text-xl text-stone-100">
          The party <span className="text-base text-stone-500">({sheets.length})</span>
        </h2>
        {sheets.length === 0 ? (
          <p className="card p-6 text-center text-stone-400">
            No players yet. Share the invite code above and their sheets will appear here live.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sheets.map((sheet) => (
              <SheetCard
                key={sheet.id}
                sheet={sheet}
                online={onlineSet.has(sheet.ownerId)}
                selected={sheet.id === selectedId}
                onSelect={() => setSelectedId((id) => (id === sheet.id ? null : sheet.id))}
              />
            ))}
          </div>
        )}
      </section>

      {selected && (
        <section aria-label={`Edit ${selected.ownerName}'s sheet`}>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-xl text-stone-100">
              {selected.data.characterName || 'Unnamed hero'}
              <span className="ml-2 text-base text-stone-500">played by {selected.ownerName}</span>
            </h2>
            <button
              type="button"
              className="text-sm text-stone-400 hover:text-stone-200"
              onClick={() => setSelectedId(null)}
            >
              Close
            </button>
          </div>
          <p className="-mt-1 mb-1 text-sm text-stone-400">
            Your changes save automatically and appear on {selected.ownerName}’s screen.
          </p>
          {/* Keyed by id so switching sheets starts a fresh draft. */}
          <EditableSheet key={selected.id} sheet={selected} />
        </section>
      )}
    </div>
  );
}
