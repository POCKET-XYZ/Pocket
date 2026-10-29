'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';
import { gsap, ScrollTrigger } from '@/lib/gsap';

let active: Lenis | null = null;

/** Scrolls the page to `y`, gliding with Lenis when it runs. */
export function scrollToY(y: number) {
  if (active) active.scrollTo(y, { duration: 1.2 });
  else window.scrollTo({ top: y });
}

/**
 * The page's one scroll engine. Lenis runs on GSAP's ticker so ScrollTrigger
 * reads the same position Lenis paints; with reduced motion it never starts
 * and the browser's own scroll stays.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lenis = new Lenis({ anchors: true });
    active = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      active = null;
    };
  }, []);

  return children;
}
