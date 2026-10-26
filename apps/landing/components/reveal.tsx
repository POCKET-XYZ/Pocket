'use client';

import { useRef } from 'react';
import { gsap, useGSAP } from '@/lib/gsap';

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** The element to render; a list keeps its semantics when its items stagger. */
  as?: 'div' | 'ul' | 'ol' | 'dl';
  /** Reveal each direct child in turn instead of the whole block at once. */
  stagger?: boolean;
};

/**
 * The page's one quiet entrance: fade in and rise 24px the first time the
 * block reaches the lower part of the screen. Nothing moves with reduced motion.
 */
export function Reveal({ children, className, as: Tag = 'div', stagger }: RevealProps) {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const el = root.current!;
        gsap.from(stagger ? el.children : el, {
          autoAlpha: 0,
          y: 24,
          duration: 0.6,
          ease: 'power3.out',
          stagger: stagger ? 0.12 : 0,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <Tag ref={root as React.Ref<never>} className={className}>
      {children}
    </Tag>
  );
}
