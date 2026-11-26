import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Debounced autosave that never runs two saves at once: edits made while a save is in
 * flight are coalesced into exactly one follow-up save of the latest value.
 */
export function useAutosave<T>(save: (value: T) => Promise<void>, delayMs = 500) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const saveRef = useRef(save);
  saveRef.current = save;

  const latest = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current || !latest.current) return;
    const { value } = latest.current;
    latest.current = null;
    inFlight.current = true;
    setStatus('saving');
    try {
      await saveRef.current(value);
      inFlight.current = false;
      if (latest.current) void flush();
      else setStatus('saved');
    } catch (err) {
      console.error('Autosave failed', err);
      inFlight.current = false;
      // Keep the unsaved value so the next edit (or retry) includes it.
      latest.current ??= { value };
      setStatus('error');
    }
  }, []);

  const schedule = useCallback(
    (value: T) => {
      latest.current = { value };
      setStatus('pending');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delayMs);
    },
    [delayMs, flush],
  );

  const retry = useCallback(() => void flush(), [flush]);

  useEffect(() => {
    // Warn before closing the tab with unsaved edits.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latest.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Navigating away inside the app: save now instead of dropping the debounced edit.
      clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  return { status, schedule, retry };
}
