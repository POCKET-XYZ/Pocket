'use client';

import { useRef } from 'react';
import { Tilt } from '@/components/pointer-motion';
import { Reveal } from '@/components/reveal';
import { gsap, media, useGSAP } from '@/lib/gsap';

const guarantees = [
  {
    render: 'vetted',
    name: 'Gente revisada',
    text: 'Un manager de Pocket revisa a mano cada startup y cada experto antes de que trabajen juntos.',
  },
  {
    render: 'lock',
    name: 'El pago queda guardado',
    text: 'Depositas antes de empezar y el dinero espera ahí. Nadie puede moverlo por su cuenta.',
  },
  {
    render: 'shield',
    name: 'Pagas por entrega',
    text: 'El trabajo se divide en entregas. Cada una se paga solo cuando la apruebas.',
  },
];

export function Protected() {
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
        <h2 className="headline-lg max-w-3xl">Tu dinero está protegido.</h2>
        <p className="mt-6 max-w-2xl text-xl text-muted">
          Ni siquiera Pocket puede tocarlo. El pago solo sale hacia el experto que
          contrataste, y solo cuando tú lo apruebas.
        </p>
        <ul className="mt-16 grid gap-14 md:grid-cols-3 md:gap-10">
          {guarantees.map((g) => (
            <li key={g.name} className="flex flex-col gap-4">
              <Tilt className="w-fit">
                <img
                  data-pop
                  src={`/renders/sm/${g.render}.webp`}
                  alt=""
                  width={320}
                  height={320}
                  loading="lazy"
                  className="size-32 md:size-40"
                />
              </Tilt>
              <h3 className="headline-md">{g.name}</h3>
              <p className="max-w-xs text-lg text-muted">{g.text}</p>
            </li>
          ))}
        </ul>
        <p className="mt-16 max-w-2xl text-sm text-muted">
          Los pagos se hacen en USDC, un dólar digital, y se guardan en Stellar con
          Trustless Work.
        </p>
      </Reveal>
    </section>
  );
}
