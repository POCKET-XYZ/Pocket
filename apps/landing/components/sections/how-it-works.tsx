'use client';

import { useRef } from 'react';
import { gsap, media, useGSAP } from '@/lib/gsap';

const steps = [
  {
    who: 'Startup',
    name: 'Publica un Job',
    text: 'Define el alcance, el presupuesto y la fecha.',
  },
  {
    who: 'Specialist',
    name: 'Aplica',
    text: 'Envía su propuesta, su precio y su tiempo.',
  },
  {
    who: 'Startup',
    name: 'Fondea el escrow',
    text: 'Los USDC quedan bloqueados en Stellar.',
  },
  {
    who: 'Specialist',
    name: 'Entrega por milestone',
    text: 'Sube cada entrega con su evidencia.',
  },
  {
    who: 'Startup',
    name: 'Aprueba y se libera',
    text: 'El pago llega directo a la wallet del specialist.',
  },
];

export function HowItWorks() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.pin, () => {
        // Pinned: the line runs across the five steps and each one lights up
        // as the line reaches it.
        const items = gsap.utils.toArray<HTMLElement>('[data-step]');
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: '+=150%',
            pin: true,
            scrub: true,
          },
        });
        tl.set(items, { opacity: 0.25 }).set('[data-progress]', { scaleX: 0 });
        items.forEach((item, i) => {
          tl.to('[data-progress]', { scaleX: (i + 1) / items.length, duration: 1 }).to(
            item,
            { opacity: 1, duration: 0.4 },
            '<0.6',
          );
        });
        tl.to({}, { duration: 0.6 });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="como-funciona"
      className="flex min-h-svh scroll-mt-16 items-center bg-off-white py-24 text-navy md:py-36"
    >
      <div className="wrap">
        <h2 className="headline-lg max-w-3xl">Cómo funciona</h2>
        <div className="relative mt-16">
          <div
            aria-hidden
            data-progress
            className="absolute inset-x-0 top-0 hidden h-0.5 origin-left bg-navy md:block"
          />
          <ol className="grid gap-10 md:grid-cols-5 md:gap-6">
            {steps.map((step, i) => (
              <li
                key={step.name}
                data-step
                className="flex flex-col gap-3 border-t-2 border-navy pt-5 md:border-navy/15"
              >
                <span className="font-heading text-4xl font-bold text-navy/25">
                  {i + 1}
                </span>
                <p className="text-sm font-medium text-navy/60">{step.who}</p>
                <h3 className="font-heading text-xl font-bold">{step.name}</h3>
                <p className="text-navy/75">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
        <p className="mt-14 max-w-2xl text-navy/75">
          Si hay desacuerdo, cualquiera de los dos abre una disputa y un manager decide:
          todo para uno, todo para el otro o dividirlo.
        </p>
      </div>
    </section>
  );
}
