'use client';

import { useRef } from 'react';
import { Tilt } from '@/components/pointer-motion';
import { Reveal } from '@/components/reveal';
import { gsap, media, useGSAP } from '@/lib/gsap';

const gains = [
  'Expertos que ya hicieron crecer otros productos.',
  'Tú defines el resultado que quieres y cuánto invertir.',
  'Cada entrega se revisa contra la meta que acordaron.',
];

// What the experts do, floating around the rocket. `depth` sets how fast each
// chip drifts on scroll, so the group reads as layers.
const skills = [
  { label: 'Contenido', className: 'left-0 top-[12%]', depth: 1.4 },
  { label: 'Ads', className: 'right-[4%] top-[4%]', depth: 0.8 },
  { label: 'Comunidad', className: 'right-0 top-[48%]', depth: 1.8 },
  { label: 'SEO', className: 'left-[6%] top-[62%]', depth: 1 },
  { label: 'Ventas', className: 'bottom-[2%] right-[18%]', depth: 1.2 },
];

export function NoTeam() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.motion, () => {
        const scroll = {
          trigger: root.current,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        };
        // The rocket climbs and leans as the section passes.
        gsap.fromTo(
          '[data-rocket]',
          { y: 80, rotation: -6 },
          { y: -80, rotation: 6, ease: 'none', scrollTrigger: scroll },
        );
        gsap.utils.toArray<HTMLElement>('[data-skill]').forEach((chip) => {
          const depth = Number(chip.dataset.skill);
          gsap.fromTo(
            chip,
            { y: 60 * depth },
            { y: -60 * depth, ease: 'none', scrollTrigger: scroll },
          );
        });
        gsap.from('[data-skill] > span', {
          scale: 0,
          autoAlpha: 0,
          ease: 'back.out(2)',
          duration: 0.5,
          stagger: 0.1,
          scrollTrigger: { trigger: root.current, start: 'top 70%', once: true },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section
      ref={root}
      id="startups"
      className="scroll-mt-20 overflow-hidden bg-off-white py-24 text-navy md:py-36"
    >
      <div className="wrap grid items-center gap-14 md:grid-cols-[1.2fr_1fr]">
        <Reveal stagger>
          <h2 className="headline-lg max-w-xl">No necesitas un equipo de marketing.</h2>
          <p className="mt-6 max-w-xl text-xl text-navy/75">
            Construiste un buen producto. Pocket te conecta con expertos en growth, ventas
            y marketing para llevarlo al mercado. Tú solo apruebas.
          </p>
          <ul className="mt-10 flex flex-col gap-4">
            {gains.map((gain) => (
              <li key={gain} className="flex items-start gap-3 text-lg">
                <span
                  aria-hidden
                  className="mt-2 size-2.5 shrink-0 rounded-full bg-celeste ring-4 ring-celeste/25"
                />
                {gain}
              </li>
            ))}
          </ul>
        </Reveal>
        <div className="relative mx-auto aspect-square w-full max-w-md">
          <Tilt className="absolute inset-[15%]">
            <img
              data-rocket
              src="/renders/md/rocket.webp"
              alt="Un cohete celeste despegando"
              width={480}
              height={480}
              loading="lazy"
              className="w-full"
            />
          </Tilt>
          {skills.map((s) => (
            <div
              key={s.label}
              data-skill={s.depth}
              aria-hidden
              className={`absolute ${s.className}`}
            >
              <span className="block rounded-full bg-white px-4 py-2 text-sm font-bold shadow-[0_8px_24px_-10px_rgb(15_46_82_/_0.35)]">
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
