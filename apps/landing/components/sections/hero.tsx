'use client';

import { useRef } from 'react';
import { Magnetic } from '@/components/pointer-motion';
import { gsap, media, useGSAP } from '@/lib/gsap';
import { links } from '@/lib/links';

const headline = 'Tu equipo de growth, sin miedo a contratar.';

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(media.motion, () => {
        // The intro runs in CSS (globals.css); GSAP adds what follows it. Three
        // nested layers so the moves never fight over one transform: the intro
        // on the image, the float on its wrapper, the parallax outside.
        gsap.to('[data-float]', {
          y: -8,
          duration: 2.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          // Floats only while the hero is on screen.
          scrollTrigger: {
            trigger: root.current,
            start: 'top bottom',
            end: 'bottom top',
            toggleActions: 'play pause resume pause',
          },
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
    <section ref={root} id="inicio" className="flex min-h-svh items-center pt-20">
      <div className="wrap grid items-center gap-10 py-16 md:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-8">
          {/* Each word rises out of its own mask; readers get the sentence whole. */}
          <h1 className="headline-xl" aria-label={headline}>
            {headline.split(' ').map((word, i) => (
              <span key={i} aria-hidden>
                <span className="intro-mask">
                  <span
                    className="intro-word"
                    style={{ '--i': i } as React.CSSProperties}
                  >
                    {word}
                  </span>
                </span>{' '}
              </span>
            ))}
          </h1>
          <p
            className="intro-fade max-w-xl text-lg text-muted md:text-xl"
            style={{ '--delay': '450ms' } as React.CSSProperties}
          >
            Encuentra expertos en marketing, ventas y growth. Solo pagas cuando apruebas
            el trabajo.
          </p>
          <div
            className="intro-fade flex flex-wrap items-center gap-4"
            style={{ '--delay': '550ms' } as React.CSSProperties}
          >
            <Magnetic>
              <a
                href={links.startup}
                className="press block rounded-full bg-yellow px-10 py-5 text-xl font-semibold text-navy shadow-[0_10px_30px_-10px_rgb(255_210_63_/_0.6)]"
              >
                Soy startup
              </a>
            </Magnetic>
            <Magnetic>
              <a
                href={links.expert}
                className="press block rounded-full border-2 border-celeste px-10 py-[18px] text-xl font-semibold text-celeste"
              >
                Soy experto
              </a>
            </Magnetic>
          </div>
        </div>
        <div data-parallax className="mx-auto w-2/3 max-w-[480px] md:w-full">
          <div data-float>
            <img
              className="intro-pop w-full"
              src="/renders/hero.webp"
              srcSet="/renders/sm/hero.webp 320w, /renders/md/hero.webp 480w, /renders/hero.webp 640w"
              sizes="(min-width: 768px) 480px, 66vw"
              alt="Un bolsillo celeste con una moneda dorada adentro"
              width={640}
              height={640}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
