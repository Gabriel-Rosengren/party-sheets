import { useEffect, useId, useState } from 'react';
import { SHEET_LIMITS } from '@party-sheets/shared';

interface BaseProps {
  label: string;
  className?: string;
}

export function TextField({
  label,
  value,
  onChange,
  className = '',
  maxLength = SHEET_LIMITS.shortTextLength,
  placeholder,
}: BaseProps & {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        className="input"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** The whole number `text` spells, if it is one between min and max; otherwise null. */
const parseIntInRange = (text: string, min: number, max: number): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/**
 * Integer input that lets the user type freely (including an empty box or a lone "-")
 * and only reports values that are valid and within range.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  className = '',
  inputClassName = '',
}: BaseProps & {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  inputClassName?: string;
}) {
  const id = useId();
  // What's in the box, which may be mid-edit and not a valid number yet.
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow external changes (e.g. a realtime update) unless the user is mid-edit.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const invalid = parseIntInRange(text, min, max) === null;

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        className={`input tabular-nums ${invalid ? 'border-red-500 focus:border-red-500' : ''} ${inputClassName}`}
        value={text}
        aria-invalid={invalid}
        title={invalid ? `Whole number from ${min} to ${max}` : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          // Leaving the box drops any invalid text and shows the last valid value again.
          setFocused(false);
          setText(String(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const next = parseIntInRange(e.target.value, min, max);
          if (next !== null) onChange(next);
        }}
      />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  className = '',
  rows = 6,
}: BaseProps & { value: string; onChange: (value: string) => void; rows?: number }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <textarea
        id={id}
        className="input resize-y text-sm"
        rows={rows}
        maxLength={SHEET_LIMITS.longTextLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
