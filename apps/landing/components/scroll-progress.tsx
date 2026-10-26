'use client';

import { useRef } from 'react';
import { gsap, useGSAP } from '@/lib/gsap';

/** A thin celeste bar along the top that fills as the page scrolls. */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    gsap.fromTo(
      bar.current,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: { start: 0, end: 'max', scrub: true },
      },
    );
  });

  return (
    <div
      ref={bar}
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-1 origin-left scale-x-0 bg-celeste"
    />
  );
}
