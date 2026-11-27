import {
  ABILITIES,
  ABILITY_LABELS,
  CONDITIONS,
  SHEET_LIMITS,
  abilityModifier,
  formatModifier,
  proficiencyBonus,
  type SheetData,
} from '@party-sheets/shared';
import { NumberField, TextAreaField, TextField } from './fields';
import { HpBar } from './HpBar';

interface Props {
  data: SheetData;
  /** Omit for a read-only sheet. */
  onChange?: (next: SheetData) => void;
}

function Section({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 ${className}`}>
      <h3 className="mb-3 font-display text-sm tracking-widest text-amber-400 uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-stone-800 bg-stone-950/50 p-3 text-center">
      <div className="text-xs tracking-wider text-stone-400 uppercase">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-stone-100 tabular-nums">{value}</div>
    </div>
  );
}

export function SheetEditor({ data, onChange }: Props) {
  const readOnly = !onChange;
  const set = <K extends keyof SheetData>(key: K, value: SheetData[K]) =>
    onChange?.({ ...data, [key]: value });

  const dexMod = abilityModifier(data.abilities.dex);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Section title="Character" className="lg:col-span-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TextField
            label="Character name"
            className="sm:col-span-2"
            value={data.characterName}
            onChange={(v) => set('characterName', v)}
            readOnly={readOnly}
            placeholder="Thia Brightwater"
          />
          <TextField
            label="Class"
            value={data.className}
            onChange={(v) => set('className', v)}
            readOnly={readOnly}
            placeholder="Rogue"
          />
          <NumberField
            label="Level"
            value={data.level}
            {...SHEET_LIMITS.level}
            onChange={(v) => set('level', v)}
            readOnly={readOnly}
          />
          <TextField
            label="Race"
            value={data.race}
            onChange={(v) => set('race', v)}
            readOnly={readOnly}
            placeholder="Half-elf"
          />
          <TextField
            label="Background"
            value={data.background}
            onChange={(v) => set('background', v)}
            readOnly={readOnly}
            placeholder="Urchin"
          />
          <TextField
            label="Alignment"
            value={data.alignment}
            onChange={(v) => set('alignment', v)}
            readOnly={readOnly}
            placeholder="Chaotic good"
          />
          <NumberField
            label="Experience"
            value={data.experience}
            {...SHEET_LIMITS.experience}
            onChange={(v) => set('experience', v)}
            readOnly={readOnly}
          />
        </div>
      </Section>

      <Section title="Ability scores" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {ABILITIES.map((ability) => {
            const score = data.abilities[ability];
            return (
              <div key={ability} className="rounded-lg border border-stone-800 bg-stone-950/50 p-3">
                <NumberField
                  label={ABILITY_LABELS[ability]}
                  value={score}
                  {...SHEET_LIMITS.abilityScore}
                  readOnly={readOnly}
                  inputClassName="text-center text-lg"
                  onChange={(v) => set('abilities', { ...data.abilities, [ability]: v })}
                />
                <div
                  className="mt-2 text-center text-sm text-amber-300 tabular-nums"
                  aria-label={`${ABILITY_LABELS[ability]} modifier`}
                >
                  {formatModifier(abilityModifier(score))}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Combat">
        <div className="space-y-4">
          <HpBar hp={data.hp} />
          {!readOnly && (
            <div className="grid grid-cols-3 gap-2">
              <NumberField
                label="Current"
                value={data.hp.current}
                {...SHEET_LIMITS.currentHp}
                onChange={(v) => set('hp', { ...data.hp, current: v })}
              />
              <NumberField
                label="Max"
                value={data.hp.max}
                {...SHEET_LIMITS.maxHp}
                onChange={(v) => set('hp', { ...data.hp, max: v })}
              />
              <NumberField
                label="Temp"
                value={data.hp.temp}
                {...SHEET_LIMITS.tempHp}
                onChange={(v) => set('hp', { ...data.hp, temp: v })}
              />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {readOnly ? (
              <>
                <Stat label="Armor class" value={data.armorClass} />
                <Stat label="Speed" value={`${data.speed} ft`} />
              </>
            ) : (
              <>
                <NumberField
                  label="Armor class"
                  value={data.armorClass}
                  {...SHEET_LIMITS.armorClass}
                  onChange={(v) => set('armorClass', v)}
                />
                <NumberField
                  label="Speed (ft)"
                  value={data.speed}
                  {...SHEET_LIMITS.speed}
                  onChange={(v) => set('speed', v)}
                />
              </>
            )}
            <Stat label="Initiative" value={formatModifier(dexMod)} />
            <Stat label="Proficiency" value={formatModifier(proficiencyBonus(data.level))} />
          </div>
        </div>
      </Section>

      <Section title="Conditions" className="lg:col-span-3">
        <div className="flex flex-wrap gap-2">
          {CONDITIONS.map((condition) => {
            const active = data.conditions.includes(condition);
            if (readOnly && !active) return null;
            return (
              <button
                key={condition}
                type="button"
                disabled={readOnly}
                aria-pressed={active}
                onClick={() =>
                  set(
                    'conditions',
                    active
                      ? data.conditions.filter((c) => c !== condition)
                      : [...data.conditions, condition],
                  )
                }
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'border-red-500/60 bg-red-500/15 text-red-300'
                    : 'border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200'
                } disabled:cursor-default`}
              >
                {condition}
              </button>
            );
          })}
          {readOnly && data.conditions.length === 0 && (
            <p className="text-sm text-stone-500">None</p>
          )}
        </div>
      </Section>

      <Section title="Inventory">
        <TextAreaField
          label="Gear & treasure"
          value={data.inventory}
          onChange={(v) => set('inventory', v)}
          readOnly={readOnly}
        />
      </Section>
      <Section title="Notes" className="lg:col-span-2">
        <TextAreaField
          label="Features, spells, backstory"
          value={data.notes}
          onChange={(v) => set('notes', v)}
          readOnly={readOnly}
        />
      </Section>
    </div>
  );
}
