'use client';

import { useRef } from 'react';
import { brand, gsap, media, useGSAP } from '@/lib/gsap';

export function Barrier() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.pin, () => {
        // The section holds still while the page turns from navy to yellow,
        // then the two fears come in from opposite sides and face each other.
        gsap
          .timeline({
            scrollTrigger: {
              trigger: root.current,
              start: 'top top',
              end: '+=120%',
              pin: true,
              scrub: true,
            },
          })
          .fromTo(
            root.current,
            { backgroundColor: brand('navy'), color: brand('off-white') },
            { backgroundColor: brand('yellow'), color: brand('navy'), duration: 1 },
          )
          .from('[data-fear="startup"]', { x: -80, autoAlpha: 0, duration: 1 }, 0.8)
          .from('[data-fear="specialist"]', { x: 80, autoAlpha: 0, duration: 1 }, 0.8)
          .to({}, { duration: 0.6 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="flex min-h-svh items-center bg-yellow py-24 text-navy md:py-36"
    >
      <div className="wrap">
        <h2 className="headline-xl max-w-4xl">La primera barrera es la confianza.</h2>
        <div className="mt-16 grid gap-12 md:grid-cols-2">
          <figure data-fear="startup" className="border-l-4 border-current pl-6">
            <figcaption className="font-medium opacity-70">
              La startup se pregunta
            </figcaption>
            <blockquote className="headline-lg mt-3">
              ¿Y si pago y no entregan?
            </blockquote>
          </figure>
          <figure data-fear="specialist" className="border-l-4 border-current pl-6">
            <figcaption className="font-medium opacity-70">
              El specialist se pregunta
            </figcaption>
            <blockquote className="headline-lg mt-3">
              ¿Y si trabajo y no me pagan?
            </blockquote>
          </figure>
        </div>
      </div>
    </section>
  );
}
