import type { SheetData } from '@party-sheets/shared';

export function HpBar({ hp }: { hp: SheetData['hp'] }) {
  const pct = hp.max > 0 ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0;
  const color = pct > 50 ? 'bg-emerald-500' : pct > 25 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-stone-400">
        <span className="font-medium tracking-wider uppercase">HP</span>
        <span className="tabular-nums">
          <span className="text-base font-semibold text-stone-100">{hp.current}</span> / {hp.max}
          {hp.temp > 0 && <span className="ml-1 text-sky-400">+{hp.temp}</span>}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-stone-800"
        role="meter"
        aria-label="Hit points"
        aria-valuemin={0}
        aria-valuemax={hp.max}
        aria-valuenow={hp.current}
      >
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
