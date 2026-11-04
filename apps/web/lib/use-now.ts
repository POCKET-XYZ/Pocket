'use client';

import { useEffect, useState } from 'react';

/** The current time, refreshed every `everyMs`, for screens that react to how long something took. */
export function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
