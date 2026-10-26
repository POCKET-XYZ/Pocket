'use client';

import { useRef } from 'react';
import { gsap, SplitText, useGSAP } from '@/lib/gsap';
import { links } from '@/lib/links';

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // The intro: the headline rises word by word out of its own mask, then
        // the copy and the buttons follow and the pocket pops in.
        SplitText.create('h1', {
          type: 'words',
          mask: 'words',
          autoSplit: true,
          onSplit(self) {
            return gsap
              .timeline({ defaults: { ease: 'power3.out' } })
              .set('h1', { visibility: 'visible' })
              .from(self.words, { yPercent: 110, duration: 0.8, stagger: 0.07 })
              .fromTo(
                '[data-intro="copy"]',
                { autoAlpha: 0, y: 24 },
                { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.1 },
                '-=0.4',
              )
              .fromTo(
                '[data-intro="pocket"]',
                { autoAlpha: 0, scale: 0.6, rotation: -8 },
                {
                  autoAlpha: 1,
                  scale: 1,
                  rotation: 0,
                  duration: 0.9,
                  ease: 'back.out(1.7)',
                },
                0.3,
              );
          },
        });

        // Three nested layers so the moves never fight over one transform:
        // the intro on the image, the float on its wrapper, the parallax outside.
        gsap.to('[data-float]', {
          y: -8,
          duration: 2.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
        gsap.to('[data-parallax]', {
          y: -120,
          scale: 0.8,
          ease: 'none',
          scrollTrigger: {
            trigger: root.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true,
          },
        });
      });
      return () => mm.revert();
    },
    { scope: root },
  );

  return (
    <section ref={root} id="inicio" className="flex min-h-svh items-center pt-16">
      <div className="wrap grid items-center gap-10 py-16 md:grid-cols-[1.7fr_1fr]">
        <div className="flex flex-col gap-8">
          <h1 data-intro="title" className="headline-xl">
            Talento de growth. Pago garantizado on-chain.
          </h1>
          <p data-intro="copy" className="max-w-xl text-lg text-muted md:text-xl">
            Startups contratan specialists verificados de growth, ventas y marketing. Cada
            pago queda en escrow en Stellar hasta que el trabajo se aprueba.
          </p>
          <div data-intro="copy" className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <a
              href={links.login}
              className="rounded-full bg-yellow px-7 py-3.5 text-lg font-medium text-navy"
            >
              Publicar un Job
            </a>
            <a
              href="#specialists"
              className="text-lg text-celeste underline-offset-4 hover:underline"
            >
              Soy specialist
            </a>
          </div>
        </div>
        <div data-parallax className="mx-auto w-2/3 max-w-[480px] md:w-full">
          <div data-float>
            <img
              data-intro="pocket"
              src="/renders/hero.webp"
              alt="Un bolsillo celeste con una moneda dorada adentro"
              width={640}
              height={640}
              fetchPriority="high"
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
