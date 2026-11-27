import { useEffect, useRef, useState } from 'react';
import type { Sheet } from '@party-sheets/shared';
import { HpBar } from './HpBar';

interface Props {
  sheet: Sheet;
  online: boolean;
  selected: boolean;
  onSelect: () => void;
}

/** Compact live summary of one player's sheet on the DM's party board. */
export function SheetCard({ sheet, online, selected, onSelect }: Props) {
  const { data } = sheet;
  // Pulse the card whenever a newer version arrives over the socket. Changing the key
  // remounts the button, which restarts the CSS 'flash' animation.
  const [flashKey, setFlashKey] = useState(0);
  const initialVersion = useRef(sheet.version);
  useEffect(() => {
    if (sheet.version !== initialVersion.current) setFlashKey((k) => k + 1);
  }, [sheet.version]);

  const subtitle = [data.race, data.className && `${data.className} ${data.level}`]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      key={flashKey}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`card flex h-full w-full flex-col p-4 text-left transition hover:border-stone-600 ${flashKey ? 'flash' : ''} ${
        selected ? 'border-amber-500/70' : ''
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg text-stone-100">
            {data.characterName || <span className="text-stone-500">Unnamed hero</span>}
          </h3>
          <p className="truncate text-sm text-stone-400">{subtitle || 'No class yet'}</p>
        </div>
        <span
          className={`mt-1 inline-flex shrink-0 items-center gap-1.5 text-xs ${online ? 'text-emerald-400' : 'text-stone-500'}`}
        >
          <span
            className={`size-2 rounded-full ${online ? 'bg-emerald-400' : 'bg-stone-600'}`}
            aria-hidden
          />
          {sheet.ownerName}
        </span>
      </div>

      <HpBar hp={data.hp} />

      <div className="mt-3 flex items-center gap-4 text-sm text-stone-300">
        <span>
          <span className="text-stone-500">AC</span>{' '}
          <span className="font-semibold tabular-nums">{data.armorClass}</span>
        </span>
        <span>
          <span className="text-stone-500">Speed</span>{' '}
          <span className="tabular-nums">{data.speed} ft</span>
        </span>
      </div>

      {data.conditions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {data.conditions.map((c) => (
            <span key={c} className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
              {c}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
