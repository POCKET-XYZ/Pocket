'use client';

import { useRef } from 'react';
import { Tilt } from '@/components/pointer-motion';
import { Reveal } from '@/components/reveal';
import { gsap, media, useGSAP } from '@/lib/gsap';

const guarantees = [
  {
    render: 'vetted',
    name: 'Verificados',
    text: 'Un manager revisa a cada startup y a cada specialist antes de que puedan trabajar juntos.',
  },
  {
    render: 'lock',
    name: 'Escrow',
    text: 'La startup bloquea el pago en USDC en Stellar antes de empezar. Nadie puede tocarlo a medias.',
  },
  {
    render: 'shield',
    name: 'Por milestone',
    text: 'El trabajo se divide en entregas. Cada una se paga cuando la startup la aprueba.',
  },
];

export function Solution() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.motion, () => {
        // The three renders pop in one after another as the list arrives.
        gsap.from('[data-pop]', {
          scale: 0.5,
          autoAlpha: 0,
          duration: 0.7,
          ease: 'back.out(1.7)',
          stagger: 0.15,
          scrollTrigger: { trigger: '[data-pop]', start: 'top 85%', once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} className="py-24 md:py-36">
      <Reveal className="wrap" stagger>
        <h2 className="headline-lg max-w-3xl">
          Pocket quita esa barrera con tres garantías.
        </h2>
        <ul className="mt-16 grid gap-14 md:grid-cols-3 md:gap-10">
          {guarantees.map((g) => (
            <li key={g.name} className="flex flex-col gap-4">
              <Tilt className="w-fit">
                <img
                  data-pop
                  src={`/renders/${g.render}.webp`}
                  alt=""
                  width={640}
                  height={640}
                  loading="lazy"
                  className="size-32 md:size-40"
                />
              </Tilt>
              <h3 className="headline-md">{g.name}</h3>
              <p className="max-w-xs text-muted">{g.text}</p>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
