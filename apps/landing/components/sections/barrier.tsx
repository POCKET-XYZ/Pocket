'use client';

import { useRef } from 'react';
import { brand, gsap, media, useGSAP } from '@/lib/gsap';

export function Barrier() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.pin, () => {
        // The section holds still while the page turns from off-white to yellow,
        // then the two fears come in from opposite sides and face each other.
        // They start fully hidden, unlike the page's 40% reveals: seeing them
        // before they arrive would spoil the face-off. The pinned title keeps
        // the screen from looking empty meanwhile.
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
            { backgroundColor: brand('off-white'), color: brand('navy') },
            { backgroundColor: brand('yellow'), color: brand('navy'), duration: 1 },
          )
          .from('[data-fear="startup"]', { x: -80, autoAlpha: 0, duration: 1 }, 0.8)
          .from('[data-fear="specialist"]', { x: 80, autoAlpha: 0, duration: 1 }, 0.8)
          .from('[data-answer]', { y: 32, autoAlpha: 0, duration: 0.8 }, 1.9)
          .to({}, { duration: 0.6 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      className="flex min-h-svh items-start bg-yellow pb-16 pt-12 text-navy md:pt-28"
    >
      <div className="wrap">
        <h2 className="headline-xl max-w-4xl">Contratar da miedo. De los dos lados.</h2>
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
              El experto se pregunta
            </figcaption>
            <blockquote className="headline-lg mt-3">
              ¿Y si trabajo y no me pagan?
            </blockquote>
          </figure>
        </div>
        <p data-answer className="headline-md mt-16 max-w-3xl">
          Con Pocket, ninguna de las dos pasa.
        </p>
      </div>
    </section>
  );
}
