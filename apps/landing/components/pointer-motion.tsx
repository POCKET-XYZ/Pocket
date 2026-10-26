'use client';

import { useRef } from 'react';
import { gsap, media, useGSAP } from '@/lib/gsap';

type Props = { children: React.ReactNode; className?: string };

/** Follows the mouse with whatever `onMove` sets; mouse only, never on touch. */
function usePointer(onMove: (el: HTMLElement) => (dx: number, dy: number) => void) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.pointer, () => {
        const el = root.current!;
        const set = onMove(el);
        // dx and dy run from -1 to 1 across the element, 0 at its centre.
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          set(
            ((e.clientX - r.left) / r.width) * 2 - 1,
            ((e.clientY - r.top) / r.height) * 2 - 1,
          );
        };
        const leave = () => set(0, 0);
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerleave', leave);
        return () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerleave', leave);
        };
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return root;
}

/** Pulls its child a little toward the cursor, as if the button were magnetic. */
export function Magnetic({ children, className }: Props) {
  const root = usePointer((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.4, ease: 'power3.out' });
    const y = gsap.quickTo(el, 'y', { duration: 0.4, ease: 'power3.out' });
    return (dx, dy) => {
      x(dx * 10);
      y(dy * 8);
    };
  });
  return (
    <div ref={root} className={`inline-block ${className ?? ''}`}>
      {children}
    </div>
  );
}

/** Tilts in 3D toward the cursor, at most 6 degrees each way. */
export function Tilt({ children, className }: Props) {
  const root = usePointer((el) => {
    gsap.set(el, { transformPerspective: 900 });
    const rx = gsap.quickTo(el, 'rotationX', { duration: 0.5, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotationY', { duration: 0.5, ease: 'power3.out' });
    return (dx, dy) => {
      ry(dx * 6);
      rx(-dy * 6);
    };
  });
  return (
    <div ref={root} className={className}>
      {children}
    </div>
  );
}
