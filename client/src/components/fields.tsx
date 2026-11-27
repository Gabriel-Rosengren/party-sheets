import { useEffect, useId, useState } from 'react';
import { SHEET_LIMITS } from '@party-sheets/shared';

interface BaseProps {
  label: string;
  readOnly?: boolean;
  className?: string;
}

export function TextField({
  label,
  value,
  onChange,
  readOnly,
  className = '',
  maxLength = SHEET_LIMITS.shortTextLength,
  placeholder,
}: BaseProps & {
  value: string;
  onChange?: (value: string) => void;
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
        placeholder={readOnly ? '—' : placeholder}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

/**
 * Integer input that lets the user type freely (including an empty box or a lone "-")
 * and only reports values that are valid and within range.
 */
export function NumberField({
  label,
  value,
  onChange,
  readOnly,
  min,
  max,
  className = '',
  inputClassName = '',
}: BaseProps & {
  value: number;
  onChange?: (value: number) => void;
  min: number;
  max: number;
  inputClassName?: string;
}) {
  const id = useId();
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow external changes (e.g. a realtime update) unless the user is mid-edit.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  const parsed = Number(text);
  const invalid = text.trim() === '' || !Number.isInteger(parsed) || parsed < min || parsed > max;

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <input
        id={id}
        inputMode="numeric"
        className={`input tabular-nums ${invalid && !readOnly ? 'border-red-500 focus:border-red-500' : ''} ${inputClassName}`}
        value={readOnly ? String(value) : text}
        disabled={readOnly}
        aria-invalid={invalid}
        title={invalid ? `Whole number from ${min} to ${max}` : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(String(value));
        }}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const n = Number(next);
          if (next.trim() !== '' && Number.isInteger(n) && n >= min && n <= max) onChange?.(n);
        }}
      />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  readOnly,
  className = '',
  rows = 6,
}: BaseProps & { value: string; onChange?: (value: string) => void; rows?: number }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {readOnly ? (
        <p id={id} className="min-h-10 text-sm whitespace-pre-wrap text-stone-300">
          {value || <span className="text-stone-500">—</span>}
        </p>
      ) : (
        <textarea
          id={id}
          className="input resize-y text-sm"
          rows={rows}
          maxLength={SHEET_LIMITS.longTextLength}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </div>
  );
}
