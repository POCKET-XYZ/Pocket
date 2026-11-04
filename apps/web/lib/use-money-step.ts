'use client';

import { useEffect, useState } from 'react';
import type { SigningStage } from './wallet';

/** After this long sending, the screen says it is taking longer than usual. */
const SLOW_AFTER_MS = 45_000;

/**
 * What a screen needs while a money step runs: the stage it is in, a warning
 * before the page is reloaded or closed while it is being sent, and whether
 * it is taking longer than usual.
 *
 * Leaving does not undo anything once the transaction is sent (the API
 * finishes it, and a second try is refused), but the person would no longer
 * see how it ended, so the browser asks first.
 */
export function useMoneyStep() {
  const [stage, setStage] = useState<SigningStage | null>(null);
  const [slow, setSlow] = useState(false);
  const busy = stage !== null;

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older browsers need a value to show their prompt.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  useEffect(() => {
    if (stage !== 'sending') return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [stage]);

  return {
    stage,
    slow,
    /** Pass to prepareSignSubmit, or call at each step of a custom flow. */
    onStage: setStage,
    /** Call when the step ends, however it ends. */
    done: () => setStage(null),
  };
}
