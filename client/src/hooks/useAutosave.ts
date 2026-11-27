import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Debounced autosave that never runs two saves at once. `schedule()` marks the data dirty;
 * edits made while a save is in flight are coalesced into exactly one follow-up save.
 * `save` should read the latest value itself (e.g. from a ref), so a save always sends the
 * newest data, including anything merged in from other people since it was scheduled.
 */
export function useAutosave(save: () => Promise<void>, delayMs = 500) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const saveRef = useRef(save);
  saveRef.current = save;

  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef(false);

  const flush = useCallback(async () => {
    if (inFlight.current || !dirty.current) return;
    dirty.current = false;
    inFlight.current = true;
    setStatus('saving');
    try {
      await saveRef.current();
      inFlight.current = false;
      if (dirty.current) void flush();
      else setStatus('saved');
    } catch (err) {
      console.error('Autosave failed', err);
      inFlight.current = false;
      // Stay dirty so the next edit (or retry) saves again.
      dirty.current = true;
      setStatus('error');
    }
  }, []);

  const schedule = useCallback(() => {
    dirty.current = true;
    setStatus('pending');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), delayMs);
  }, [delayMs, flush]);

  const retry = useCallback(() => void flush(), [flush]);

  useEffect(() => {
    // Warn before closing the tab with unsaved edits.
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
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
